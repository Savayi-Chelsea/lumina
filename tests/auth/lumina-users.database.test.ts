import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { findLuminaUser, findPasswordAccount, googleEmailConflict, IdentityLinkRequired, linkGoogleUser } from "@/lib/lumina-users";
import { createAuthConfig } from "@/lib/auth-config";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("Google identity SQL on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let publicUsersBefore: string;
  const subject = "google-test-subject";
  const email = "google-test@gmail.com";

  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    const host = url?.hostname || process.env.POSTGRES_HOST || "localhost";
    const db = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.POSTGRES_DB;
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || db !== "lumina") {
      throw new Error("Database tests require the local development lumina database");
    }
    pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 1 } : {
      host, database: db, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
      port: Number(process.env.POSTGRES_PORT || "5432"), max: 1,
    });
    shared.conn = await pool.connect();
    publicUsersBefore = JSON.stringify((await shared.conn.query("SELECT to_jsonb(u) AS row FROM public.users u ORDER BY id")).rows);
    await shared.conn.query("CREATE TEMP TABLE users (LIKE public.users INCLUDING ALL)");
  });

  beforeEach(async () => { await shared.conn!.query("DELETE FROM pg_temp.users"); });

  afterAll(async () => {
    if (shared.conn) {
      try {
        const after = JSON.stringify((await shared.conn.query("SELECT to_jsonb(u) AS row FROM public.users u ORDER BY id")).rows);
        expect(after === publicUsersBefore).toBe(true);
      } finally { shared.conn.release(); shared.conn = undefined; }
    }
    if (pool) await pool.end();
  });

  it("creates a Google-only user as pending and unverified", async () => {
    const user = await linkGoogleUser(subject, email);
    expect(user.account_status).toBe("pending");
    expect(user.alumni_verified).toBe(false);
    const result = await shared.conn!.query("SELECT password_hash, email_verified, google_subject FROM pg_temp.users WHERE id=$1", [user.id]);
    expect(result.rows[0]).toEqual({ password_hash: null, email_verified: true, google_subject: subject });
    expect(await findLuminaUser(user.id)).toEqual(user);
  });

  it("reuses the same UUID and preserves existing password, role, status, email and verification", async () => {
    const initial = await linkGoogleUser(subject, email);
    await shared.conn!.query("UPDATE pg_temp.users SET role='admin',account_status='active',alumni_verified=true,password_hash='test-existing-hash' WHERE id=$1", [initial.id]);
    const user = await linkGoogleUser(subject, "changed-google-email@gmail.com");
    expect(user).toEqual({ ...initial, role: "admin", account_status: "active", alumni_verified: true });
    const row = (await shared.conn!.query("SELECT email,password_hash FROM pg_temp.users WHERE id=$1", [initial.id])).rows[0];
    expect(row).toEqual({ email, password_hash: "test-existing-hash" });
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.users")).rows[0].n).toBe(1);
  });

  it("refuses email collisions without linking the existing user", async () => {
    await shared.conn!.query("INSERT INTO pg_temp.users(email,password_hash,role) VALUES($1,'test-hash','admin')", [email]);
    await expect(linkGoogleUser(subject, email)).rejects.toBeInstanceOf(IdentityLinkRequired);
    const row = (await shared.conn!.query("SELECT google_subject,password_hash,role FROM pg_temp.users")).rows[0];
    expect(row).toEqual({ google_subject: null, password_hash: "test-hash", role: "admin" });
  });

  it("enforces unique non-null subjects and permits multiple null subjects", async () => {
    await linkGoogleUser(subject, email);
    await expect(shared.conn!.query("INSERT INTO pg_temp.users(email,google_subject) VALUES('duplicate@example.test',$1)", [subject]))
      .rejects.toMatchObject({ code: "23505" });
    await shared.conn!.query("INSERT INTO pg_temp.users(email) VALUES('null-one@example.test'),('null-two@example.test')");
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.users WHERE google_subject IS NULL")).rows[0].n).toBe(2);
  });

  it("denies suspended subject-linked users", async () => {
    const user = await linkGoogleUser(subject, email);
    await shared.conn!.query("UPDATE pg_temp.users SET account_status='suspended' WHERE id=$1", [user.id]);
    await expect(linkGoogleUser(subject, email)).rejects.toThrow("Account unavailable");
  });

  it("builds a session from real user storage and rejects it after suspension", async () => {
    const callbacks = createAuthConfig({ findLuminaUser, findPasswordAccount, googleEmailConflict, linkGoogleUser }).callbacks!;
    const token = await callbacks.jwt!({
      token: {}, user: {}, account: { provider: "google", type: "oidc", providerAccountId: subject },
      profile: { sub: subject, email, email_verified: true, name: "Google Test User" },
    });
    expect(token?.alumniVerified).toBe(false);
    expect(token?.luminaStatus).toBe("pending");
    await shared.conn!.query("UPDATE pg_temp.users SET account_status='suspended' WHERE id=$1", [token!.luminaUserId]);
    expect(await callbacks.jwt!({ token: token!, user: {} })).toBeNull();
  });
  it("persists only validated Google photos without changing authorization", async () => {
    const user = await linkGoogleUser(subject, email, "https://lh3.googleusercontent.com/photo");
    expect((await shared.conn!.query("SELECT google_image_url FROM pg_temp.users WHERE id=$1", [user.id])).rows[0].google_image_url).toBe("https://lh3.googleusercontent.com/photo");
    expect(await findLuminaUser(user.id)).toEqual(user);
    await linkGoogleUser(subject, email, "https://evil.test/photo");
    expect((await shared.conn!.query("SELECT google_image_url FROM pg_temp.users WHERE id=$1", [user.id])).rows[0].google_image_url).toBeNull();
  });

});
