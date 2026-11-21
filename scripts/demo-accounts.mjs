// Create or restore demo sign-in accounts on the LOCAL development database.
//
//   npm run demo:accounts                 # reads .demo-accounts.json
//   npm run demo:accounts -- other.json   # or another file
//
// .demo-accounts.json is gitignored (never commit passwords). Format:
//   [
//     { "email": "member@example.com", "password": "a long passphrase", "name": "Member Name", "role": "alumni" },
//     { "email": "admin@example.com",  "password": "another passphrase", "name": "Admin Name",  "role": "admin" }
//   ]
//
// Each account is created, or brought back to a usable state if it exists: the
// password is set with the app's own Argon2id hashing (src/lib/passwords.ts), the
// account is active, alumni accounts are verified, and a name-only draft profile
// is added when none exists. Existing profiles, connections and messages are kept.
// Google-only accounts and synthetic fixtures are refused. Passwords are never printed.
// Run with: node --conditions=react-server (the npm script does this).
import { readFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/passwords.ts";
import { isValidEmail, normalizeEmail, passwordProblem } from "../src/lib/credentials-input.ts";

nextEnv.loadEnvConfig(process.cwd());
const file = process.argv[2] || ".demo-accounts.json";
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const host = url?.hostname || process.env.POSTGRES_HOST || "localhost";
const database = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.POSTGRES_DB;
if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || database !== "lumina") {
  console.error("Refusing: demo accounts are only created on the local development lumina database.");
  process.exit(1);
}

let accounts;
try {
  accounts = JSON.parse(await readFile(file, "utf8"));
} catch (error) {
  console.error(error.code === "ENOENT" ? `No ${file}; create it as described at the top of scripts/demo-accounts.mjs.` : `Could not read ${file}: ${error.message}`);
  process.exit(1);
}
if (!Array.isArray(accounts) || !accounts.length) { console.error(`${file} must be a non-empty JSON array.`); process.exit(1); }

const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 1 } : {
  host, database, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT || "5432"), max: 1,
});
let failures = 0;
try {
  for (const account of accounts) {
    const email = normalizeEmail(account?.email);
    const name = typeof account?.name === "string" ? account.name.trim().replace(/\s+/g, " ") : "";
    const role = account?.role === "admin" ? "admin" : "alumni";
    const problem = !isValidEmail(email) ? "invalid email"
      : email.endsWith("@synthetic.lumina.local") ? "synthetic fixture accounts cannot sign in"
      : typeof account.password !== "string" ? "missing password"
      : passwordProblem(account.password)
      || (!name || name.length > 150 ? "name is required (at most 150 characters)" : null);
    if (problem) { console.error(`✗ ${email || "(no email)"}: ${problem}`); failures++; continue; }
    const hash = await hashPassword(account.password);
    const conn = await pool.connect();
    try {
      await conn.query("BEGIN");
      const existing = (await conn.query("SELECT id, role, google_subject, password_hash FROM users WHERE lower(email) = $1 FOR UPDATE", [email])).rows[0];
      if (existing?.google_subject && !existing.password_hash) {
        await conn.query("ROLLBACK");
        console.error(`✗ ${email}: this is a Google account; sign in with Google instead.`); failures++; continue;
      }
      const id = existing
        ? (await conn.query(`UPDATE users SET password_hash = $2, role = $3, account_status = 'active',
            alumni_verified = alumni_verified OR $4, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`, [existing.id, hash, role, role === "alumni"])).rows[0].id
        : (await conn.query(`INSERT INTO users (email, password_hash, role, account_status, email_verified, alumni_verified)
            VALUES ($1, $2, $3, 'active', FALSE, $4) RETURNING id`, [email, hash, role, role === "alumni"])).rows[0].id;
      const profile = await conn.query("INSERT INTO profiles (user_id, full_name, profile_completed) VALUES ($1, $2, FALSE) ON CONFLICT (user_id) DO NOTHING", [id, name]);
      if (role === "admin" && existing?.role !== "admin") {
        await conn.query("INSERT INTO audit_log (actor_id, action, target_type, target_id, details) VALUES (NULL, 'user.promote_admin', 'user', $1, $2)",
          [id, JSON.stringify({ via: "demo accounts script" })]);
      }
      await conn.query("COMMIT");
      console.log(`✓ ${email}: ${existing ? "restored" : "created"} as ${role === "admin" ? "administrator" : "verified alumni"}${profile.rowCount ? ", draft profile added" : ""}`);
    } catch (error) {
      await conn.query("ROLLBACK").catch(() => {});
      console.error(`✗ ${email}: ${error.message}`); failures++;
    } finally { conn.release(); }
  }
} finally { await pool.end(); }
process.exit(failures ? 1 : 0);
