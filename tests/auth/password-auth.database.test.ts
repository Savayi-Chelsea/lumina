import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { createPasswordUser, findLuminaUser, findPasswordAccount, googleEmailConflict, linkGoogleUser } from "@/lib/lumina-users";
import { authorizePassword, createAuthConfig } from "@/lib/auth-config";
import { hashPassword } from "@/lib/passwords";
import { createSignInThrottle } from "@/lib/sign-in-throttle";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("password accounts on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let publicBefore: string;
  const PASSWORD = "harbour lights at dawn";
  const email = "password-test@example.test";
  const store = { findLuminaUser, findPasswordAccount, googleEmailConflict, linkGoogleUser };
  const snapshot = async () => JSON.stringify((await shared.conn!.query(
    "SELECT (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u) AS users, (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p) AS profiles")).rows);
  const register = async (address = email) => createPasswordUser("Amina Otieno", address, await hashPassword(PASSWORD));

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
    publicBefore = await snapshot();
    await shared.conn.query("CREATE TEMP TABLE users (LIKE public.users INCLUDING ALL)");
    await shared.conn.query("CREATE TEMP TABLE profiles (LIKE public.profiles INCLUDING ALL)");
  });

  beforeEach(async () => { await shared.conn!.query("DELETE FROM pg_temp.profiles; DELETE FROM pg_temp.users"); });

  afterAll(async () => {
    if (shared.conn) {
      try { expect(await snapshot()).toBe(publicBefore); }
      finally { shared.conn.release(); shared.conn = undefined; }
    }
    if (pool) await pool.end();
  });

  it("creates a pending, unverified alumni account with an Argon2id hash and name-only draft profile", async () => {
    expect(await register()).toBe("created");
    const user = (await shared.conn!.query("SELECT * FROM pg_temp.users")).rows[0];
    expect(user).toMatchObject({ email, role: "alumni", account_status: "pending", alumni_verified: false, email_verified: false, google_subject: null });
    expect(user.password_hash).toMatch(/^\$argon2id\$v=19\$/);
    expect(user.password_hash).not.toContain(PASSWORD);
    const profile = (await shared.conn!.query("SELECT full_name, profile_completed, former_kq_department FROM pg_temp.profiles WHERE user_id=$1", [user.id])).rows[0];
    expect(profile).toEqual({ full_name: "Amina Otieno", profile_completed: false, former_kq_department: null });
  });

  it("rejects duplicates case-insensitively, including emails owned by Google accounts", async () => {
    expect(await register()).toBe("created");
    expect(await register()).toBe("duplicate");
    await linkGoogleUser("google-sub-dup", "Google.Owner@Example.test");
    expect(await register("google.owner@example.test")).toBe("duplicate");
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.users")).rows[0].n).toBe(2);
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.profiles")).rows[0].n).toBe(1);
  });

  it("authorizes correct passwords and refuses wrong, unknown, Google-only, fixture and suspended accounts", async () => {
    await register();
    const throttle = createSignInThrottle();
    const user = await authorizePassword(store, { email: "Password-Test@Example.test", password: PASSWORD }, throttle);
    expect(user).toMatchObject({ name: "Amina Otieno", email });
    expect(await authorizePassword(store, { email, password: "the wrong passphrase" }, throttle)).toBeNull();
    expect(await authorizePassword(store, { email: "nobody@example.test", password: PASSWORD }, throttle)).toBeNull();
    await linkGoogleUser("google-only-sub", "google-only@example.test");
    expect(await authorizePassword(store, { email: "google-only@example.test", password: PASSWORD }, throttle)).toBeNull();
    await shared.conn!.query("INSERT INTO pg_temp.users(email,password_hash,account_status,alumni_verified) VALUES('alum-001@synthetic.lumina.local','synthetic_not_for_login','active',TRUE)");
    expect(await authorizePassword(store, { email: "alum-001@synthetic.lumina.local", password: "synthetic_not_for_login" }, throttle)).toBeNull();
    await shared.conn!.query("UPDATE pg_temp.users SET account_status='suspended' WHERE email=$1", [email]);
    expect(await authorizePassword(store, { email, password: PASSWORD }, throttle)).toBeNull();
  });

  it("builds a password session from PostgreSQL and follows role, verification and suspension changes", async () => {
    await register();
    const config = createAuthConfig(store, createSignInThrottle());
    const user = await authorizePassword(store, { email, password: PASSWORD }, createSignInThrottle());
    const token = await config.callbacks!.jwt!({ token: {}, user: user!, account: { provider: "credentials", type: "credentials", providerAccountId: user!.id } });
    expect(token).toMatchObject({ luminaUserId: user!.id, luminaRole: "alumni", luminaStatus: "pending", alumniVerified: false });
    await shared.conn!.query("UPDATE pg_temp.users SET role='admin', account_status='active', alumni_verified=TRUE WHERE id=$1", [user!.id]);
    expect(await config.callbacks!.jwt!({ token: token!, user: {} })).toMatchObject({ luminaRole: "admin", luminaStatus: "active", alumniVerified: true });
    await shared.conn!.query("UPDATE pg_temp.users SET account_status='suspended' WHERE id=$1", [user!.id]);
    expect(await config.callbacks!.jwt!({ token: token!, user: {} })).toBeNull();
  });

  it("detects Google sign-ins that would collide with a password account without linking them", async () => {
    await register();
    expect(await googleEmailConflict("new-google-sub", "PASSWORD-TEST@example.test")).toBe(true);
    expect(await googleEmailConflict("new-google-sub", "fresh@example.test")).toBe(false);
    const config = createAuthConfig(store, createSignInThrottle());
    const signIn = await config.callbacks!.signIn!({ user: {}, account: { provider: "google", type: "oidc", providerAccountId: "new-google-sub" },
      profile: { sub: "new-google-sub", email, email_verified: true } });
    expect(signIn).toBe("/sign-in?error=account-exists");
    expect((await shared.conn!.query("SELECT google_subject FROM pg_temp.users WHERE email=$1", [email])).rows[0].google_subject).toBeNull();
    await linkGoogleUser("existing-sub", "existing@example.test");
    expect(await googleEmailConflict("existing-sub", "existing@example.test")).toBe(false);
  });
});
