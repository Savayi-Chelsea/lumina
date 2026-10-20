// Production HTTP checks with a temporary local fixture and a test-signed session.
// This verifies session handling, not Google's external OAuth exchange.
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";

nextEnv.loadEnvConfig(process.cwd());
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const host = url?.hostname || process.env.POSTGRES_HOST || "localhost";
const database = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.POSTGRES_DB;
assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && database === "lumina",
  "HTTP smoke tests require the local development lumina database");
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 1 } : {
  host, database, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT || "5432"), max: 1,
});
let server;
let fixtureId;
let fixtureRegistryId;
let fixtureAdminId;
let originalUsers;
let originalData;
const subject = `auth-smoke-${randomUUID()}`;
const staffNumber = `SYN-ALUM-${BigInt('0x' + randomBytes(6).toString('hex'))}`;
const readUsers = async () => JSON.stringify((await pool.query("SELECT to_jsonb(u) AS row FROM public.users u ORDER BY id")).rows);
const preservedTables = ["alumni_registry", "verification_assistance_requests", "profiles", "profile_embeddings", "profile_skills", "skills", "mentorship_preferences", "work_experience"];
async function readData() {
  const values = {};
  for (const table of preservedTables) values[table] = JSON.stringify((await pool.query(`SELECT to_jsonb(t) AS row FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows);
  return values;
}

try {
  originalUsers = await readUsers();
  originalData = await readData();
  const portProbe = createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const origin = `http://localhost:${port}`;
  const base = `http://127.0.0.1:${port}`;
  const secret = randomBytes(32).toString("base64");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env, AUTH_SECRET: secret, AUTH_GOOGLE_ID: "local-test-client", AUTH_GOOGLE_SECRET: "local-test-placeholder", AUTH_URL: origin },
  });
  server.on("error", () => {});
  let ready = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.exitCode !== null) throw new Error("Production test server exited early");
    try { ready = (await fetch(`${base}/sign-in`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (ready) break;
    await delay(200);
  }
  assert.ok(ready, "Production test server must become ready");
  const cookies = new Map();
  async function request(path, options = {}) {
    const headers = new Headers(options.headers);
    headers.set("Cookie", [...cookies].map(([key, value]) => `${key}=${value}`).join("; "));
    const response = await fetch(base + path, { ...options, headers, redirect: "manual" });
    for (const cookie of response.headers.getSetCookie()) {
      const item = cookie.split(";", 1)[0];
      const split = item.indexOf("=");
      const key = item.slice(0, split), value = item.slice(split + 1);
      if (value) cookies.set(key, value); else cookies.delete(key);
    }
    return response;
  }
  function formData(html, buttonText, userId) {
    const form = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(match => match[0])
      .find(value => value.includes(buttonText) && (!userId || value.includes(`value="${userId}"`)));
    assert.ok(form, `Server-rendered ${buttonText} form must exist`);
    const decode = value => value.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
    const data = new FormData();
    for (const [input] of form.matchAll(/<input\b[^>]*>/g)) {
      if (!/type="hidden"/.test(input)) continue;
      const name = /name="([^"]*)"/.exec(input)?.[1];
      const value = /value="([^"]*)"/.exec(input)?.[1] || "";
      if (name) data.append(decode(name), decode(value));
    }
    assert.ok([...data.keys()].some(key => key.startsWith("$ACTION_")), "Must use the real Next server action reference");
    return data;
  }
  let response = await request("/account");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/sign-in");
  console.log("PASS unauthenticated account redirects to sign in");
  assert.equal(await (await request("/api/auth/session")).json(), null);
  console.log("PASS unauthenticated session is null");
  assert.equal((await request("/verify")).status, 307);
  assert.equal((await request("/admin/verification")).status, 307);

  fixtureId = (await pool.query(`INSERT INTO public.users(email,password_hash,google_subject,account_status,alumni_verified)
    VALUES($1,NULL,$2,'pending',false) RETURNING id`, [`${subject}@example.test`, subject])).rows[0].id;
  cookies.set("authjs.session-token", await encode({
    secret, salt: "authjs.session-token", maxAge: 300,
    token: { sub: fixtureId, luminaUserId: fixtureId, name: "Google Smoke User", email: `${subject}@example.test`, alumniVerified: true, luminaRole: "admin" },
  }));
  response = await request("/account");
  assert.equal(response.status, 200);
  let html = await response.text();
  assert.ok(html.includes("Google Smoke User") && html.includes("Not verified") && html.includes("Open account menu"));
  console.log("PASS authenticated account renders Google information and account menu");
  const session = await (await request("/api/auth/session")).json();
  assert.equal(session.user.id, fixtureId);
  assert.equal(session.user.role, "alumni");
  assert.equal(session.user.accountStatus, "pending");
  assert.equal(session.user.alumniVerified, false);
  assert.equal(session.access_token, undefined);
  assert.equal(session.refresh_token, undefined);
  console.log("PASS session uses PostgreSQL role/status/verification and exposes no OAuth tokens");
  html = await (await request("/")).text();
  assert.ok(html.includes("Google Smoke User") && html.includes("Open account menu"));
  console.log("PASS home page responds to authenticated session");
  assert.ok(html.includes('href="/verify"') && !html.includes("Verified by Lumina"));
  response = await request("/admin");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/account");
  console.log("PASS non-admin cannot access administration despite forged JWT role");

  response = await request("/onboarding");
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/verify");
  fixtureRegistryId = (await pool.query(`INSERT INTO public.alumni_registry
    (synthetic_staff_number,surname,former_kq_department,kq_start_year,kq_end_year)
    VALUES($1,'SmokeSurname','ICT / Digital',2008,2016) RETURNING id`, [staffNumber])).rows[0].id;
  html = await (await request("/verify")).text();
  assert.ok(html.includes("Why we verify") && !html.includes("SmokeSurname") && !html.includes("Fictional"));
  let data = formData(html, "Verify alumni details");
  for (const [name,value] of Object.entries({ staff_number: staffNumber, surname: "Incorrect", department: "ICT / Digital", start_year: "2008", end_year: "2016" })) data.set(name,value);
  response = await request("/verify", { method: "POST", headers: { Origin: base }, body: data });
  assert.equal(response.status, 200);
  html = await response.text();
  assert.ok(html.includes("could not resolve your verification"));
  assert.equal((await pool.query("SELECT account_status FROM public.users WHERE id=$1",[fixtureId])).rows[0].account_status,"pending");
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.verification_assistance_requests WHERE user_id=$1",[fixtureId])).rows[0].n,0);
  console.log("PASS unresolved check permits retry and creates no routine admin work");

  data = formData(html, "Request assistance");
  response = await request("/verify", { method: "POST", headers: { Origin: base }, body: data });
  assert.equal(response.status,200);
  assert.equal((await pool.query("SELECT resolution_outcome FROM public.verification_assistance_requests WHERE user_id=$1",[fixtureId])).rows[0].resolution_outcome,null);
  html = await (await request("/verify")).text();
  assert.ok(html.includes("Assistance request open"));
  console.log("PASS explicit assistance creates an open exception");

  data = formData(html, "Verify alumni details");
  for (const [name,value] of Object.entries({ staff_number: staffNumber.toLowerCase(), surname: "  SMOKESURNAME ", department: " ict  / digital ", start_year: "2008", end_year: "2016" })) data.set(name,value);
  response = await request("/verify", { method: "POST", headers: { Origin: base }, body: data });
  assert.equal(response.status,303);
  assert.equal(new URL(response.headers.get("location"),origin).pathname,"/profile");
  assert.equal((await pool.query("SELECT claimed_by_user_id FROM public.alumni_registry WHERE id=$1",[fixtureRegistryId])).rows[0].claimed_by_user_id,fixtureId);
  assert.equal((await pool.query("SELECT resolution_outcome FROM public.verification_assistance_requests WHERE user_id=$1",[fixtureId])).rows[0].resolution_outcome,"verified");
  console.log("PASS real verification action claims, activates and resolves assistance automatically");
  html = await (await request("/")).text();
  assert.ok(html.includes("Verified by Lumina") && !html.includes('href="/verify"'));
  assert.equal((await request("/profile")).status, 200);
  console.log("PASS verified alumni dashboard and profile editor");

  const alumniCookie = cookies.get("authjs.session-token");
  fixtureAdminId = (await pool.query(`INSERT INTO public.users(email,google_subject,role,account_status)
    VALUES($1,$2,'admin','active') RETURNING id`, [`admin-${subject}@example.test`,`admin-${subject}`])).rows[0].id;
  const adminCookie = await encode({ secret, salt: "authjs.session-token", maxAge: 300, token: { luminaUserId: fixtureAdminId } });
  cookies.set("authjs.session-token",adminCookie);
  assert.equal((await request("/admin")).status, 200);
  html = await (await request("/admin/verification")).text();
  assert.ok(html.includes("Verification assistance") && !html.includes(`${subject}@example.test`));
  console.log("PASS database-authorized admin dashboard and verification requests");

  // Reopen only this test fixture to exercise both real admin resolution actions.
  await pool.query("UPDATE public.users SET account_status='pending',alumni_verified=false WHERE id=$1 AND google_subject=$2",[fixtureId,subject]);
  cookies.set("authjs.session-token",alumniCookie);
  html = await (await request("/verify")).text();
  response = await request("/verify", { method: "POST", headers: { Origin: base }, body: formData(html,"Request assistance") });
  assert.equal(response.status,200);
  cookies.set("authjs.session-token",adminCookie);
  html = await (await request("/admin/verification")).text();
  data = formData(html,"Close unresolved",fixtureId); data.set("outcome","closed_unresolved");
  response = await request("/admin/verification", { method: "POST", headers: { Origin: base }, body: data });
  assert.equal(response.status,303);
  assert.equal((await pool.query("SELECT account_status FROM public.users WHERE id=$1",[fixtureId])).rows[0].account_status,"pending");
  assert.equal((await pool.query("SELECT resolution_outcome FROM public.verification_assistance_requests WHERE user_id=$1",[fixtureId])).rows[0].resolution_outcome,"closed_unresolved");
  cookies.set("authjs.session-token",alumniCookie);
  html = await (await request("/verify")).text();
  assert.ok(html.includes("closed unresolved"));
  response = await request("/verify", { method: "POST", headers: { Origin: base }, body: formData(html,"Request assistance") });
  assert.equal(response.status,200);
  cookies.set("authjs.session-token",adminCookie);
  html = await (await request("/admin/verification")).text();
  data = formData(html,"Associate record and verify",fixtureId);
  data.set("staff_number",staffNumber); data.set("confirm_association","yes"); data.set("outcome","verified");
  response = await request("/admin/verification", { method: "POST", headers: { Origin: base }, body: data });
  assert.equal(response.status,303);
  assert.equal((await pool.query("SELECT alumni_verified FROM public.users WHERE id=$1",[fixtureId])).rows[0].alumni_verified,true);
  assert.equal((await pool.query("SELECT resolved_by_user_id FROM public.verification_assistance_requests WHERE user_id=$1",[fixtureId])).rows[0].resolved_by_user_id,fixtureAdminId);
  console.log("PASS admin closes unresolved safely, user reopens, and admin associates a confirmed registry record");

  const { csrfToken } = await (await request("/api/auth/csrf")).json();
  response = await request("/api/auth/signout", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, callbackUrl: origin }),
  });
  assert.equal(response.status, 302);
  assert.equal(await (await request("/api/auth/session")).json(), null);
  assert.equal((await request("/account")).status, 307);
  console.log("PASS Auth.js sign out clears the session and protects the account again");

  cookies.set("authjs.session-token", await encode({ secret, salt: "authjs.session-token", maxAge: 300, token: { luminaUserId: fixtureId } }));
  await pool.query("UPDATE public.users SET account_status='suspended' WHERE id=$1 AND google_subject=$2", [fixtureId, subject]);
  assert.equal((await request("/account")).status, 307);
  console.log("PASS suspended accounts cannot use an existing session");
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = once(server, "exit");
    server.kill();
    await stopped;
  }
  try {
    if (fixtureId) await pool.query("DELETE FROM public.verification_assistance_requests WHERE user_id=$1", [fixtureId]);
    if (fixtureRegistryId) await pool.query("DELETE FROM public.alumni_registry WHERE id=$1 AND synthetic_staff_number=$2", [fixtureRegistryId,staffNumber]);
    if (fixtureId) await pool.query("DELETE FROM public.users WHERE id=$1 AND google_subject=$2", [fixtureId, subject]);
    if (fixtureAdminId) await pool.query("DELETE FROM public.users WHERE id=$1 AND google_subject=$2", [fixtureAdminId,`admin-${subject}`]);
    if (originalUsers !== undefined) {
      assert.equal(await readUsers() === originalUsers, true, "Existing users must remain unchanged");
      console.log("PASS temporary fixture removed; all existing user values preserved");
    }
    if (originalData) assert.deepEqual(await readData(), originalData, "Existing registry, assistance and matching/profile data must remain unchanged");
  } finally { await pool.end(); }
}
