import "server-only";
import { connect } from "node:net";
import { database } from "@/lib/db";

/**
 * Live status of every moving part, for administrators. Each check is bounded
 * by a short timeout so a dead dependency can't hang the page.
 */
export type HealthState = "good" | "warning" | "critical";
export type HealthCheck = { name: string; state: HealthState; summary: string; detail: string };

async function timed<T>(work: () => Promise<T>) {
  const start = performance.now();
  const value = await work();
  return { value, ms: Math.round(performance.now() - start) };
}

function tcp(host: string, port: number, timeout = 2000) {
  return new Promise<boolean>(resolve => {
    const socket = connect({ host, port });
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeout, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

function hostPort(value: string | undefined, fallbackPort: number) {
  if (!value) return null;
  const [host, port] = value.split(",")[0].trim().split(":");
  return host ? { host, port: Number(port || fallbackPort) } : null;
}

async function databaseCheck(): Promise<HealthCheck> {
  try {
    const { ms } = await timed(() => database().query("SELECT 1"));
    return { name: "Database (PostgreSQL + pgvector)", state: ms > 500 ? "warning" : "good", summary: ms > 500 ? "Slow" : "Online", detail: `Responded in ${ms} ms` };
  } catch {
    return { name: "Database (PostgreSQL + pgvector)", state: "critical", summary: "Unreachable", detail: "Queries are failing. Check the lumina-postgres container." };
  }
}

async function matchingCheck(): Promise<HealthCheck> {
  const name = "Matching service (BGE model)";
  const configured = process.env.MATCHING_SERVICE_URL;
  if (!configured) return { name, state: "critical", summary: "Not configured", detail: "MATCHING_SERVICE_URL is not set." };
  try {
    const base = new URL(configured.endsWith("/") ? configured : `${configured}/`);
    const { value, ms } = await timed(() => fetch(new URL("ready", base), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) }));
    if (value.ok) return { name, state: "good", summary: "Ready", detail: `Model loaded and database reachable (${ms} ms)` };
    return { name, state: "warning", summary: "Starting or degraded", detail: `Readiness check returned ${value.status}. Mentor search may fail.` };
  } catch {
    return { name, state: "critical", summary: "Not running", detail: "Mentor search and recommendations are unavailable. Start it with: python -m uvicorn services.matching.app.main:app --port 8000" };
  }
}

async function brokerCheck(): Promise<HealthCheck> {
  const name = "Event streaming (Kafka)";
  const target = hostPort(process.env.KAFKA_BOOTSTRAP_SERVERS || "127.0.0.1:9092", 9092);
  const reachable = target ? await tcp(target.host, target.port) : false;
  const outbox = (await database().query<{ pending: number; oldest_minutes: number | null }>(`SELECT count(*)::int AS pending,
    round((extract(epoch FROM CURRENT_TIMESTAMP - min(created_at)) / 60)::numeric, 1)::float AS oldest_minutes
    FROM profile_change_outbox WHERE published_at IS NULL`).catch(() => ({ rows: [{ pending: -1, oldest_minutes: null }] }))).rows[0];
  const lagging = outbox.pending > 0 && (outbox.oldest_minutes ?? 0) > 5;
  if (!reachable) return { name, state: "critical", summary: "Broker unreachable", detail: `${Math.max(0, outbox.pending)} profile change(s) waiting. Start the kafka container.` };
  if (lagging) return { name, state: "warning", summary: "Re-indexing behind", detail: `${outbox.pending} change(s) waiting, oldest ${outbox.oldest_minutes} min. Is scripts/run_profile_events.py running?` };
  return { name, state: "good", summary: "Online", detail: outbox.pending ? `${outbox.pending} change(s) being processed` : "No profile changes waiting" };
}

async function emailCheck(): Promise<HealthCheck> {
  const name = "Email (SMTP)";
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT) return { name, state: "warning", summary: "Not configured", detail: "Password reset and session emails are off." };
  const reachable = await tcp(process.env.SMTP_HOST, Number(process.env.SMTP_PORT));
  return reachable ? { name, state: "good", summary: "Online", detail: `SMTP server accepting connections on port ${process.env.SMTP_PORT}` }
    : { name, state: "critical", summary: "Unreachable", detail: "Emails will fail. Check the mail server (Mailpit locally)." };
}

async function indexCheck(): Promise<HealthCheck> {
  const name = "Mentor search index";
  try {
    const row = (await database().query<{ eligible: number; indexed: number; last_indexed: string | null }>(`SELECT
      count(*)::int AS eligible, count(e.id)::int AS indexed, max(e.indexed_at)::text AS last_indexed
      FROM mentorship_preferences m LEFT JOIN profile_embeddings e ON e.profile_id = m.profile_id WHERE m.consent_to_matching`)).rows[0];
    const missing = row.eligible - row.indexed;
    return { name, state: missing ? "warning" : "good", summary: `${row.indexed} of ${row.eligible} consenting profiles indexed`,
      detail: missing ? `${missing} profile(s) not yet embedded; run the re-indexing worker.` : `Last update ${row.last_indexed ? new Date(row.last_indexed).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" }) : "never"}` };
  } catch {
    return { name, state: "critical", summary: "Unknown", detail: "The index could not be read." };
  }
}

export async function systemHealth() {
  const checks = await Promise.all([databaseCheck(), matchingCheck(), indexCheck(), brokerCheck(), emailCheck()]);
  const overall: HealthState = checks.some(c => c.state === "critical") ? "critical" : checks.some(c => c.state === "warning") ? "warning" : "good";
  return { checks, overall, checked_at: new Date().toISOString() };
}
