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
let originalUsers;
const subject = `auth-smoke-${randomUUID()}`;
const readUsers = async () => JSON.stringify((await pool.query("SELECT to_jsonb(u) AS row FROM public.users u ORDER BY id")).rows);

try {
  originalUsers = await readUsers();
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
  let response = await request("/account");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/sign-in");
  console.log("PASS unauthenticated account redirects to sign in");
  assert.equal(await (await request("/api/auth/session")).json(), null);
  console.log("PASS unauthenticated session is null");

  fixtureId = (await pool.query(`INSERT INTO public.users(email,password_hash,google_subject,account_status,alumni_verified)
    VALUES($1,NULL,$2,'pending',false) RETURNING id`, [`${subject}@example.test`, subject])).rows[0].id;
  cookies.set("authjs.session-token", await encode({
    secret, salt: "authjs.session-token", maxAge: 300,
    token: { sub: fixtureId, luminaUserId: fixtureId, name: "Google Smoke User", email: `${subject}@example.test`, alumniVerified: true, luminaRole: "admin" },
  }));
  response = await request("/account");
  assert.equal(response.status, 200);
  let html = await response.text();
  assert.ok(html.includes("Google Smoke User") && html.includes("Not verified") && html.includes("Sign out"));
  console.log("PASS authenticated account renders Google information and sign out");
  const session = await (await request("/api/auth/session")).json();
  assert.equal(session.user.id, fixtureId);
  assert.equal(session.user.role, "alumni");
  assert.equal(session.user.accountStatus, "pending");
  assert.equal(session.user.alumniVerified, false);
  assert.equal(session.access_token, undefined);
  assert.equal(session.refresh_token, undefined);
  console.log("PASS session uses PostgreSQL role/status/verification and exposes no OAuth tokens");
  html = await (await request("/")).text();
  assert.ok(html.includes("Google Smoke User") && html.includes("Sign out"));
  console.log("PASS home page responds to authenticated session");

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
    if (fixtureId) await pool.query("DELETE FROM public.users WHERE id=$1 AND google_subject=$2", [fixtureId, subject]);
    if (originalUsers !== undefined) {
      assert.equal(await readUsers() === originalUsers, true, "Existing users must remain unchanged");
      console.log("PASS temporary fixture removed; all existing user values preserved");
    }
  } finally { await pool.end(); }
}
