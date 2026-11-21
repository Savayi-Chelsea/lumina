import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { consumeResetToken, issueResetToken } from "@/lib/password-reset";
import { hashPassword, verifyPassword } from "@/lib/passwords";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("password reset tokens on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: string;
  const email = "reset-test@example.test";
  const snapshot = async () => JSON.stringify((await shared.conn!.query(
    "SELECT (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u) AS users, (SELECT count(*) FROM public.password_reset_tokens) AS tokens")).rows);

  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    const host = url?.hostname || process.env.POSTGRES_HOST || "localhost";
    const db = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.POSTGRES_DB;
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || db !== "lumina") throw new Error("Database tests require the local development lumina database");
    pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 1 } : {
      host, database: db, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, port: Number(process.env.POSTGRES_PORT || "5432"), max: 1,
    });
    shared.conn = await pool.connect();
    before = await snapshot();
    await shared.conn.query("CREATE TEMP TABLE users (LIKE public.users INCLUDING ALL)");
    await shared.conn.query("CREATE TEMP TABLE password_reset_tokens (LIKE public.password_reset_tokens INCLUDING ALL)");
  });

  beforeEach(async () => {
    await shared.conn!.query("DELETE FROM pg_temp.password_reset_tokens; DELETE FROM pg_temp.users");
    await shared.conn!.query("INSERT INTO pg_temp.users(email, password_hash, account_status) VALUES ($1, $2, 'pending')", [email, await hashPassword("original passphrase")]);
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toBe(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  const hashOf = async () => (await shared.conn!.query("SELECT password_hash FROM pg_temp.users WHERE email = $1", [email])).rows[0].password_hash;

  it("stores only a SHA-256 digest and resets the password once", async () => {
    const token = (await issueResetToken(email))!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = (await shared.conn!.query("SELECT token_hash, expires_at - created_at AS ttl FROM pg_temp.password_reset_tokens")).rows[0];
    expect(stored.token_hash).toHaveLength(32);
    expect(stored.token_hash.toString("base64url")).not.toBe(token);
    expect(stored.ttl.minutes).toBe(30);
    expect(await consumeResetToken(token, await hashPassword("brand new passphrase"))).toBe(email);
    expect(await verifyPassword("brand new passphrase", await hashOf())).toBe(true);
    expect(await consumeResetToken(token, await hashPassword("another passphrase"))).toBeNull();
    expect(await verifyPassword("brand new passphrase", await hashOf())).toBe(true);
  });

  it("revokes older tokens when a new one is issued", async () => {
    const first = (await issueResetToken(email))!;
    const second = (await issueResetToken(email))!;
    expect(await consumeResetToken(first, "$argon2id$ignored")).toBeNull();
    expect(await consumeResetToken(second, await hashPassword("second passphrase"))).toBe(email);
  });

  it("rejects expired, malformed and unknown tokens", async () => {
    const token = (await issueResetToken(email))!;
    await shared.conn!.query("UPDATE pg_temp.password_reset_tokens SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 minute'");
    expect(await consumeResetToken(token, "$argon2id$x")).toBeNull();
    expect(await consumeResetToken("short", "$argon2id$x")).toBeNull();
    expect(await consumeResetToken("A".repeat(43), "$argon2id$x")).toBeNull();
    expect(await verifyPassword("original passphrase", await hashOf())).toBe(true);
  });

  it("never issues tokens for unknown, Google-only, fixture or suspended accounts", async () => {
    await shared.conn!.query(`INSERT INTO pg_temp.users(email, password_hash, google_subject) VALUES ('google@example.test', NULL, 'sub-1'),
      ('alum-001@synthetic.lumina.local', 'synthetic_not_for_login', NULL)`);
    expect(await issueResetToken("nobody@example.test")).toBeNull();
    expect(await issueResetToken("google@example.test")).toBeNull();
    expect(await issueResetToken("alum-001@synthetic.lumina.local")).toBeNull();
    const token = (await issueResetToken(email))!;
    await shared.conn!.query("UPDATE pg_temp.users SET account_status = 'suspended'");
    expect(await issueResetToken(email)).toBeNull();
    expect(await consumeResetToken(token, "$argon2id$x")).toBeNull();
  });
});
