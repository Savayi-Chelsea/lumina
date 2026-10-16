// Real Next.js -> FastAPI -> pinned BGE -> PostgreSQL/pgvector demonstration.
// Google OAuth itself is external; use a disposable Google-linked session fixture.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";

nextEnv.loadEnvConfig(process.cwd());
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const localHosts = ["localhost", "127.0.0.1", "::1", "[::1]"];
assert.ok(localHosts.includes(dbUrl?.hostname || process.env.POSTGRES_HOST || "localhost") && (dbUrl ? dbUrl.pathname.slice(1) : process.env.POSTGRES_DB) === "lumina", "Live demonstration requires the local development lumina database");
const matching = new URL(process.env.MATCHING_SERVICE_URL || "http://127.0.0.1:8000");
assert.ok(localHosts.includes(matching.hostname) && matching.protocol === "http:", "Live demonstration uses only the local matching service");
const pool = new Pool(dbUrl ? { connectionString: process.env.DATABASE_URL, max: 1 } : { host: process.env.POSTGRES_HOST || "localhost", port: Number(process.env.POSTGRES_PORT || 5432), user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB, max: 1 });
const output = "artifacts/frontend/mentorship-live";
const query = "I want to move from IT support into AWS cloud engineering and DevOps.";
const subject = `mentorship-demo-${randomUUID()}`;
const testGoogleRedirect = process.env.LUMINA_TEST_GOOGLE_REDIRECT === "1";
const staffNumber = `SYN-ALUM-${BigInt("0x" + randomBytes(6).toString("hex"))}`;
let nextServer, matchingServer, browser, userId, registryId, baseline;
const snapshot = async () => {
  const state = {};
  for (const table of ["users", "profiles", "alumni_registry", "verification_assistance_requests", "profile_embeddings", "profile_skills", "skills", "mentorship_preferences", "work_experience"]) state[table] = JSON.stringify((await pool.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows);
  return state;
};
async function stop(child) {
  if (child && child.exitCode === null && child.signalCode === null) { const stopped = once(child,"exit"); child.kill(); await stopped; }
}
try {
  baseline = await snapshot(); await mkdir(output,{ recursive: true });
  let healthy = false;
  try { healthy = (await fetch(new URL("/health",matching),{ signal: AbortSignal.timeout(2000) })).ok; } catch {}
  if (!healthy) {
    const python = process.env.LUMINA_PYTHON || (process.platform === "win32" ? ".venv/Scripts/python.exe" : ".venv/bin/python");
    matchingServer = spawn(python,["-m","uvicorn","services.matching.app.main:app","--host","127.0.0.1","--port",matching.port || "8000"], { windowsHide: true, stdio: "ignore", env: process.env });
    for (let i = 0; i < 240; i++) {
      try { healthy = (await fetch(new URL("/health",matching),{ signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (healthy) break;
      await delay(500);
    }
  }
  assert.ok(healthy,"The real matching API must be running");
  console.log("Warming the real BGE model and checking pgvector readiness…");
  const warming = setInterval(() => console.log("Still preparing the local matching model…"),20000);
  try { assert.equal((await fetch(new URL("/ready",matching),{ signal: AbortSignal.timeout(600000) })).status,200); } finally { clearInterval(warming); }
  const probe = createServer(); probe.listen(0,"127.0.0.1"); await once(probe,"listening");
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const secret = randomBytes(32).toString("base64");
  nextServer = spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)], { windowsHide: true, stdio: ["ignore","pipe","pipe"], env: { ...process.env, AUTH_SECRET: secret, AUTH_URL: base, APP_ORIGIN: base, AUTH_GOOGLE_ID: "local-demo", AUTH_GOOGLE_SECRET: "local-demo", MATCHING_SERVICE_URL: matching.href } });
  let startupLog = "";
  nextServer.stdout.on("data",chunk => { startupLog = (startupLog + chunk.toString()).slice(-2000); });
  nextServer.stderr.on("data",chunk => { startupLog = (startupLog + chunk.toString()).slice(-2000); });
  let ready = false;
  for (let i = 0; i < 100; i++) { if (nextServer.exitCode !== null) break; try { ready = (await fetch(base,{ signal: AbortSignal.timeout(1000) })).ok; } catch {} if (ready) break; await delay(250); }
  if (!ready) console.log("Next startup diagnostics:",startupLog);
  assert.ok(ready,"Production Lumina must start");
  const executablePath = process.env.LUMINA_BROWSER || ["C:/Program Files/Google/Chrome/Application/chrome.exe","D:/Programs/Google/Chrome/Application/chrome.exe","C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(path => existsSync(path));
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440,height: 1050 }, reducedMotion: "reduce" });
  context.setDefaultTimeout(30000);
  const page = await context.newPage(); const runtimeErrors = [];
  page.on("pageerror",error => runtimeErrors.push(error.message));
  await page.goto(`${base}/sign-in`); await expect(page.getByRole("button",{ name: "Continue with Google" })).toBeVisible();
  // Verify real Auth.js initiation without pretending to automate Google's external consent/exchange.
  if (testGoogleRedirect) {
    await page.route("https://accounts.google.com/**",route => route.fulfill({ status: 200,contentType: "text/html",body: "<main>External Google authorization step</main>" }));
    await page.getByRole("button",{ name: "Continue with Google" }).click();
    await expect(page).toHaveURL(/^https:\/\/accounts\.google\.com\//);
    await page.goto(`${base}/sign-in`);
    console.log("PASS real Google authorization redirect; external consent/exchange remains manual");
  }
  assert.equal((await context.request.post(`${base}/api/mentorship/search`,{ data: { query } })).status(),401);
  userId = (await pool.query("INSERT INTO public.users(email,google_subject,account_status,email_verified) VALUES($1,$2,'pending',true) RETURNING id",[`${subject}@example.test`,subject])).rows[0].id;
  registryId = (await pool.query("INSERT INTO public.alumni_registry(synthetic_staff_number,surname,former_kq_department,kq_start_year,kq_end_year) VALUES($1,'DemoAlumni','ICT / Digital',2005,2015) RETURNING id",[staffNumber])).rows[0].id;
  const token = await encode({ secret,salt: "authjs.session-token",maxAge: 1200,token: { luminaUserId: userId,name: "Mentorship Demo User",email: `${subject}@example.test` } });
  await context.addCookies([{ name: "authjs.session-token",value: token,url: base,httpOnly: true,sameSite: "Lax" }]);
  assert.equal((await context.request.post(`${base}/api/mentorship/search`,{ data: { query } })).status(),403);
  await page.goto(`${base}/onboarding`); await expect(page).toHaveURL(/\/verify$/);
  for (const [label,value] of [["Synthetic staff number",staffNumber],["Surname","DemoAlumni"],["Former KQ department","ICT / Digital"],["KQ start year","2005"],["KQ end year","2015"]]) await page.getByLabel(label,{ exact: true }).fill(value);
  await page.screenshot({ path: `${output}/01-verification.png`,fullPage: true });
  await page.getByRole("button",{ name: "Verify alumni details",exact: true }).click();
  await expect(page).toHaveURL(/\/profile\?verified=1$/);
  const account = (await pool.query("SELECT account_status,alumni_verified FROM public.users WHERE id=$1",[userId])).rows[0];
  assert.deepEqual(account,{ account_status: "active",alumni_verified: true });
  assert.equal((await pool.query("SELECT claimed_by_user_id FROM public.alumni_registry WHERE id=$1",[registryId])).rows[0].claimed_by_user_id,userId);
  for (const [label,value] of [["Full name (required)","Mentorship Demo User"],["Headline","IT support professional exploring cloud engineering"],["Former KQ role","IT Support"],["Former KQ department","ICT / Digital"],["KQ start year","2005"],["KQ end year","2015"]]) await page.getByLabel(label,{ exact: true }).fill(value);
  await page.getByRole("button",{ name: "Save profile",exact: true }).click(); await expect(page.getByText(/^Profile saved\./)).toBeVisible();
  await page.getByRole("link",{ name: "Home",exact: true }).click(); await expect(page.getByText("Verified by Lumina",{ exact: true })).toBeVisible();
  console.log("PASS Google-linked session → registry verification → saved profile → Lumina home");
  for (const headers of [{}, { Origin: "https://external.example" }, { Origin: "null" }, { Origin: "not-an-origin" }]) {
    assert.equal((await context.request.post(`${base}/api/mentorship/search`, { data: { query }, headers })).status(), 403, "Invalid or missing Origin must be denied for verified accounts");
  }
  const directProxy = await context.request.post(`${base}/api/mentorship/search`,{ data: { query },headers: { Origin: base } });
  if (directProxy.status() !== 200) console.log("Direct proxy failure classification:",(await directProxy.json()).error?.code);
  assert.equal(directProxy.status(),200,"Verified account must be authorized by the Next.js proxy");
  await page.getByRole("link",{ name: "Mentorship",exact: true }).click();
  await page.getByRole("textbox",{ name: "What would you like mentorship with?" }).fill(query);
  await expect(page.getByText(`${Array.from(query).length} / 500 characters`,{ exact: true })).toBeVisible();
  const reply = page.waitForResponse(response => response.url().endsWith("/api/mentorship/search"),{ timeout: 120000 });
  await page.getByRole("button",{ name: "Find mentors",exact: true }).click();
  const response = await reply;
  if (response.status() !== 200) console.log("Search failure classification:", (await Promise.race([response.json(),delay(3000).then(() => ({ error: { code: "RESPONSE_BODY_UNAVAILABLE" } }))])).error?.code);
  assert.equal(response.status(),200);
  const data = await response.json(); assert.ok(data.results.length > 0,"The synthetic dataset must return real ranked matches for the cloud query");
  const direct = await fetch(new URL("/mentors/search",matching),{ method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify({ query }),signal: AbortSignal.timeout(120000) });
  assert.equal(direct.status,200); const ranked = (await direct.json()).results;
  assert.deepEqual(data.results.map(item => item.profileId),ranked.map(item => item.profile_id),"Next.js must preserve FastAPI ranking");
  data.results.forEach((item,index) => { assert.equal(item.matchRelevance,ranked[index].similarity_score); assert.ok(item.name); assert.equal(item.availableForMentorship,true); });
  for (const forbidden of ["embedding","source_hash","model_name","google_subject","password_hash","similarity_threshold"]) assert.ok(!JSON.stringify(data).includes(forbidden));
  await expect(page.getByRole("heading",{ name: `${data.results.length} mentors to discover`,exact: true })).toBeVisible();
  await expect(page.getByRole("article").first()).toContainText(data.results[0].name);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: `${output}/02-ranked-mentors-desktop.png`,fullPage: true });
  await page.setViewportSize({ width: 375,height: 900 });
  await page.evaluate(() => window.scrollTo(0,0));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${output}/03-ranked-mentors-mobile.png`,fullPage: true });
  await page.getByRole("link",{ name: "View alumni profile",exact: true }).first().click();
  await expect(page.getByRole("heading",{ level: 1,name: data.results[0].name,exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({ path: `${output}/04-full-mentor-profile.png`,fullPage: true });
  assert.deepEqual(runtimeErrors,[]);
  await writeFile(`${output}/report.json`,JSON.stringify({ passed: true,googleAuthorizationRedirectTested: testGoogleRedirect,googleOAuth: "External consent/exchange not automated; production-authenticated Google-linked session fixture used",registryVerification: "Real server action and atomic database claim",matching: "Real FastAPI, pinned BGE and pgvector; no mocked search or embeddings",query,rankedMentors: data.results.map(item => ({ name: item.name,profileId: item.profileId,matchRelevance: item.matchRelevance,synthetic: item.synthetic })),rankingPreserved: true,runtimeErrors },null,2));
  console.log("PASS natural-language query → Next.js proxy → real BGE → pgvector → ranked mentors → full alumni profile");
  console.log(JSON.stringify(data.results.map(item => ({ name: item.name,matchRelevance: item.matchRelevance,synthetic: item.synthetic })),null,2));
} finally {
  await browser?.close(); await stop(nextServer); await stop(matchingServer);
  try {
    if (userId) await pool.query("DELETE FROM public.verification_assistance_requests WHERE user_id=$1",[userId]);
    if (registryId) await pool.query("DELETE FROM public.alumni_registry WHERE id=$1 AND synthetic_staff_number=$2",[registryId,staffNumber]);
    if (userId) await pool.query("DELETE FROM public.users WHERE id=$1 AND google_subject=$2",[userId,subject]);
    if (baseline) assert.deepEqual(await snapshot(),baseline,"All pre-existing data must be preserved");
    console.log("PASS live demonstration fixtures removed; existing data preserved");
  } finally { await pool.end(); }
}
