import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { listUsers, parseUserFilters, setAccountStatus } from "@/lib/admin-users";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

describe("user filters", () => {
  it("accepts only known statuses and sane pages", () => {
    expect(parseUserFilters({ q: " amina ", status: "suspended", page: "2" })).toEqual({ q: "amina", status: "suspended", page: 2 });
    expect(parseUserFilters({ status: "deleted", page: "-1" })).toEqual({ q: "", status: null, page: 1 });
  });
});

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("admin user management on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: string;
  const ids: Record<string, string> = {};
  const snapshot = async () => JSON.stringify((await shared.conn!.query("SELECT jsonb_agg(to_jsonb(u) ORDER BY id) AS users FROM public.users u")).rows);

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
    for (const table of ["users", "profiles"]) await shared.conn.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  });

  beforeEach(async () => {
    await shared.conn!.query("DELETE FROM pg_temp.profiles; DELETE FROM pg_temp.users");
    const insert = async (key: string, sql: string) => { ids[key] = (await shared.conn!.query(sql)).rows[0].id; };
    await insert("admin", "INSERT INTO pg_temp.users(email, role, account_status, alumni_verified, google_subject) VALUES ('admin@example.test','admin','active',TRUE,'g-admin') RETURNING id");
    await insert("verified", "INSERT INTO pg_temp.users(email, account_status, alumni_verified, password_hash) VALUES ('verified@example.test','active',TRUE,'$argon2id$v=19$x') RETURNING id");
    await insert("pending", "INSERT INTO pg_temp.users(email, account_status, alumni_verified, google_subject) VALUES ('pending@example.test','pending',FALSE,'g-pending') RETURNING id");
    await insert("sample", "INSERT INTO pg_temp.users(email, account_status, alumni_verified, password_hash) VALUES ('alum-001@synthetic.lumina.local','active',TRUE,'synthetic_not_for_login') RETURNING id");
    await shared.conn!.query("INSERT INTO pg_temp.profiles(user_id, full_name) VALUES ($1, 'Amina 100% Otieno')", [ids.verified]);
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toBe(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  it("lists users with sign-in method and never exposes credentials", async () => {
    const result = await listUsers({ q: "", status: null, page: 1 });
    expect(result.total).toBe(4);
    expect(result.summary).toEqual({ active: 3, pending: 1, suspended: 0, verified: 3 });
    expect(Object.fromEntries(result.users.map(user => [user.email, user.sign_in]))).toEqual({
      "admin@example.test": "Google", "verified@example.test": "Password", "pending@example.test": "Google", "alum-001@synthetic.lumina.local": "Sample" });
    expect(result.users.at(-1)?.email).toBe("alum-001@synthetic.lumina.local");
    expect(JSON.stringify(result)).not.toMatch(/argon2|synthetic_not_for_login|g-admin/);
    expect((await listUsers({ q: "100%", status: null, page: 1 })).users.map(user => user.email)).toEqual(["verified@example.test"]);
    expect((await listUsers({ q: "", status: "pending", page: 1 })).users.map(user => user.email)).toEqual(["pending@example.test"]);
  });

  it("suspends and reinstates alumni to the right status", async () => {
    expect(await setAccountStatus(ids.admin, ids.verified, "suspend")).toBe(true);
    expect(await setAccountStatus(ids.admin, ids.verified, "suspend")).toBe(false);
    expect(await setAccountStatus(ids.admin, ids.pending, "suspend")).toBe(true);
    expect(await setAccountStatus(ids.admin, ids.verified, "reinstate")).toBe(true);
    expect(await setAccountStatus(ids.admin, ids.pending, "reinstate")).toBe(true);
    const statuses = (await shared.conn!.query("SELECT email, account_status FROM pg_temp.users ORDER BY email")).rows;
    expect(Object.fromEntries(statuses.map(row => [row.email, row.account_status]))).toMatchObject({ "verified@example.test": "active", "pending@example.test": "pending" });
  });

  it("never changes administrators, the acting admin or malformed ids", async () => {
    expect(await setAccountStatus(ids.admin, ids.admin, "suspend")).toBe(false);
    expect(await setAccountStatus(ids.verified, ids.admin, "suspend")).toBe(false);
    expect(await setAccountStatus(ids.admin, "not-a-uuid", "suspend")).toBe(false);
    expect((await shared.conn!.query("SELECT account_status FROM pg_temp.users WHERE id = $1", [ids.admin])).rows[0].account_status).toBe("active");
  });
});
