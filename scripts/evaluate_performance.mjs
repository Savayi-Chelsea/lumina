// Performance evaluation: mentor-matching latency and ordinary page response times,
// idle and under concurrent matching load.
//
//   Needs the production web app (npm run build && npx next start --port 3000), the
//   matching service on :8000 and PostgreSQL. Run on an otherwise idle machine:
//     node --no-warnings scripts/evaluate_performance.mjs
//   Options (environment): PERF_BASE (http://127.0.0.1:3000), PERF_ROUNDS (5),
//   PERF_PAGE_SAMPLES (20), PERF_LEVELS ("1,4,8"), PERF_OUT (evaluation/results/performance).
//
// A temporary verified alumni account is created for the run (signed in with a locally
// minted Auth.js session, as the repository's HTTP tests do) and deleted afterwards,
// together with the search logs it produced. Every request is recorded; nothing is
// discarded except the clearly labelled warm-up requests.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import nextEnv from "@next/env";
import { encode } from "next-auth/jwt";
import { Pool } from "pg";

nextEnv.loadEnvConfig(process.cwd());
const BASE = (process.env.PERF_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const MATCHING = (process.env.MATCHING_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";
const ROUNDS = Number(process.env.PERF_ROUNDS || 5);
const PAGE_SAMPLES = Number(process.env.PERF_PAGE_SAMPLES || 20);
const LEVELS = (process.env.PERF_LEVELS || "1,4,8").split(",").map(Number).filter(n => n > 0);
const OUT = process.env.PERF_OUT || "evaluation/results/performance";
const TIMEOUT_MS = 60000;
const PAGES = ["/network", "/events", "/opportunities", "/profile", "/notifications"];
const HOME = "/";  // also asks the matching service for "Mentors for you" (streamed)

const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 2 } : {
  host: process.env.POSTGRES_HOST || "localhost", port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, max: 2,
});
const queries = JSON.parse(await readFile("evaluation/relevance_labels.json", "utf8")).queries.map(q => q.query);
const samples = [];

async function timed(record, request) {
  const start = performance.now();
  let status = 0, error = "";
  try {
    const response = await request();
    status = response.status;
    await response.arrayBuffer();  // full body, including streamed sections
    if (!response.ok) error = `HTTP ${status}`;
  } catch (exception) {
    error = exception.name === "TimeoutError" ? "timeout" : exception.name || "error";
  }
  const ms = performance.now() - start;
  if (record) samples.push({ ...record, ms: Number(ms.toFixed(2)), status, error });
  return { ms, error };
}

const signal = () => AbortSignal.timeout(TIMEOUT_MS);
let cookie = "";
const direct = query => fetch(`${MATCHING}/mentors/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: signal() });
const viaApp = query => fetch(`${BASE}/api/mentorship/search`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookie }, body: JSON.stringify({ query }), signal: signal(), redirect: "manual" });
const page = path => fetch(`${BASE}${path}`, { headers: { Cookie: cookie }, signal: signal(), redirect: "manual" });

function stats(values) {
  if (!values.length) return { n: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const pick = q => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  const round = v => Number(v.toFixed(1));
  return { n: values.length, mean: round(values.reduce((a, b) => a + b, 0) / values.length), median: round(pick(0.5)),
    p95: round(pick(0.95)), p99: round(pick(0.99)), min: round(sorted[0]), max: round(sorted.at(-1)) };
}

async function samplePages(phase, level) {
  for (let i = 0; i < PAGE_SAMPLES; i++) {
    for (const path of [...PAGES, HOME]) await timed({ phase, level, kind: path === HOME ? "home (with recommendations)" : "page", target: path }, () => page(path));
  }
}

let userId;
try {
  const subject = randomUUID().slice(0, 8);
  userId = (await pool.query(`INSERT INTO users (email, account_status, alumni_verified, google_subject, email_verified)
    VALUES ($1, 'active', TRUE, $2, TRUE) RETURNING id`, [`perf-${subject}@example.test`, `perf-${subject}`])).rows[0].id;
  await pool.query(`INSERT INTO profiles (user_id, full_name, headline, former_kq_role, former_kq_department, kq_start_year, kq_end_year,
    current_job_title, industry, location, profile_completed) VALUES ($1, 'Performance Test Member', 'Operations analyst', 'Ramp Agent',
    'Ground Operations', 2010, 2018, 'Operations Analyst', 'Logistics', 'Nairobi', TRUE)`, [userId]);
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required (the same secret the running app uses)");
  const name = BASE.startsWith("https:") ? "__Secure-authjs.session-token" : "authjs.session-token";
  cookie = `${name}=${await encode({ secret, salt: name, maxAge: 3600, token: { luminaUserId: userId, sub: userId, name: "Performance Test Member", email: `perf-${subject}@example.test` } })}`;
  const check = await page("/network");
  if (check.status !== 200) throw new Error(`Signed-in page check returned ${check.status}; is AUTH_SECRET the one the running app uses?`);
  const probe = await viaApp(queries[0]);
  if (probe.status !== 200) throw new Error(`Mentor search via the app returned ${probe.status}; check APP_ORIGIN and the matching service`);

  console.log("Warming up (not recorded)…");
  for (let i = 0; i < 5; i++) { await timed(null, () => direct(queries[i])); await timed(null, () => viaApp(queries[i])); for (const path of [...PAGES, HOME]) await timed(null, () => page(path)); }

  console.log(`Idle: matching ${queries.length}×${ROUNDS} direct and via the app; pages ${PAGES.length + 1}×${PAGE_SAMPLES}…`);
  for (let r = 0; r < ROUNDS; r++) for (const q of queries) await timed({ phase: "idle", level: 0, kind: "matching (service)", target: "/mentors/search" }, () => direct(q));
  for (let r = 0; r < ROUNDS; r++) for (const q of queries) await timed({ phase: "idle", level: 0, kind: "matching (via app)", target: "/api/mentorship/search" }, () => viaApp(q));
  await samplePages("idle", 0);

  for (const level of LEVELS) {
    console.log(`Load: ${level} concurrent searcher(s) while sampling pages…`);
    let running = true, completed = 0;
    const started = performance.now();
    const workers = Array.from({ length: level }, (_, w) => (async () => {
      let i = w;
      while (running) { await timed({ phase: "load", level, kind: "matching (via app)", target: "/api/mentorship/search" }, () => viaApp(queries[i++ % queries.length])); completed++; }
    })());
    await new Promise(resolve => setTimeout(resolve, 2000));  // let the load reach steady state
    await samplePages("load", level);
    running = false;
    await Promise.all(workers);
    samples.push({ phase: "load", level, kind: "throughput", target: "searches/second", ms: Number((completed / ((performance.now() - started) / 1000)).toFixed(3)), status: 0, error: "" });
  }
} finally {
  if (userId) {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    const residue = (await pool.query("SELECT count(*)::int AS n FROM mentor_search_events WHERE searcher_id = $1", [userId])).rows[0].n;
    if (residue) console.error(`Warning: ${residue} search log rows left for the temporary account`);
  }
  await pool.end();
}

// ---------- summarise ----------
const groups = new Map();
for (const s of samples.filter(s => s.kind !== "throughput")) {
  const key = `${s.phase}|${s.level}|${s.kind}${s.kind === "page" ? "" : ""}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(s);
}
const summary = [...groups.entries()].map(([key, rows]) => {
  const [phase, level, kind] = key.split("|");
  const ok = rows.filter(r => !r.error).map(r => r.ms);
  return { phase, concurrent_searchers: Number(level), kind, requests: rows.length, errors: rows.length - ok.length,
    error_rate: Number(((rows.length - ok.length) / rows.length).toFixed(4)), ...Object.fromEntries(Object.entries(stats(ok)).map(([k, v]) => [k === "n" ? "successful" : `${k}_ms`, v])) };
});
const perPage = PAGES.concat(HOME).map(path => {
  const idle = samples.filter(s => s.phase === "idle" && s.target === path && !s.error).map(s => s.ms);
  return { page: path, ...Object.fromEntries(Object.entries(stats(idle)).map(([k, v]) => [`idle_${k}`, v])) };
});
const throughput = samples.filter(s => s.kind === "throughput").map(s => ({ concurrent_searchers: s.level, searches_per_second: s.ms }));
let commit = "unknown";
try { commit = execSync("git rev-parse --short HEAD").toString().trim() + (execSync("git status --porcelain").toString().trim() ? " (with uncommitted changes)" : ""); } catch {}
const environment = {
  measured_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), commit, base: BASE, node: process.version,
  cpus: os.cpus().length, cpu_model: os.cpus()[0]?.model, memory_gb: Number((os.totalmem() / 2 ** 30).toFixed(1)),
  platform: `${os.type()} ${os.release()}`, codespaces: process.env.CODESPACES === "true",
  rounds: ROUNDS, page_samples: PAGE_SAMPLES, levels: LEVELS, queries: queries.length, request_timeout_ms: TIMEOUT_MS,
  note: "Web app, matching service, PostgreSQL and the load generator all share this one machine.",
};
await mkdir(OUT, { recursive: true });
const toCsv = rows => { const fields = [...new Set(rows.flatMap(Object.keys))]; return [fields.join(","), ...rows.map(r => fields.map(f => r[f] ?? "").join(","))].join("\n") + "\n"; };
await writeFile(`${OUT}/latency_samples.csv`, toCsv(samples));
await writeFile(`${OUT}/summary.csv`, toCsv(summary));
await writeFile(`${OUT}/pages_idle.csv`, toCsv(perPage));
await writeFile(`${OUT}/throughput.csv`, toCsv(throughput));
await writeFile(`${OUT}/summary.json`, JSON.stringify({ environment, summary, pages_idle: perPage, throughput }, null, 2) + "\n");
console.table(summary.map(({ phase, concurrent_searchers, kind, requests, errors, mean_ms, median_ms, p95_ms }) => ({ phase, concurrent_searchers, kind, requests, errors, mean_ms, median_ms, p95_ms })));
console.table(throughput);
