import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { verifyAlumni } from "@/lib/verification";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined, userId: "" }));
vi.mock("@/lib/session", () => ({ requireSession: async () => ({ user: { id: shared.userId } }) }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

const details = { staffNumber: "SYN-ALUM-900", surname: "muthoni", department: "ict / digital", startYear: 2014, endYear: 2023 };

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("registry verification for every sign-in method on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: string;
  const snapshot = async () => JSON.stringify((await shared.conn!.query(
    "SELECT (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u) AS users, (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.alumni_registry r) AS registry")).rows);

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
    for (const table of ["users", "alumni_registry", "verification_assistance_requests"]) await shared.conn.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  });

  beforeEach(async () => {
    await shared.conn!.query("DELETE FROM pg_temp.verification_assistance_requests; DELETE FROM pg_temp.alumni_registry; DELETE FROM pg_temp.users");
    await shared.conn!.query(`INSERT INTO pg_temp.alumni_registry (synthetic_staff_number, surname, former_kq_department, kq_start_year, kq_end_year)
      VALUES ('SYN-ALUM-900', 'Muthoni', 'ICT / Digital', 2014, 2023)`);
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toBe(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  const account = async (values: string) => (await shared.conn!.query(`INSERT INTO pg_temp.users (email, password_hash, google_subject, account_status) VALUES ${values} RETURNING id`)).rows[0].id;
  const state = async (id: string) => (await shared.conn!.query("SELECT account_status, alumni_verified FROM pg_temp.users WHERE id = $1", [id])).rows[0];

  it("verifies an email/password account and activates it", async () => {
    shared.userId = await account("('password@example.test', '$argon2id$v=19$m=19456,t=2,p=1$abc$def', NULL, 'pending')");
    expect(await verifyAlumni(details)).toBe("verified");
    expect(await state(shared.userId)).toEqual({ account_status: "active", alumni_verified: true });
  });

  it("still verifies Google accounts", async () => {
    shared.userId = await account("('google@example.test', NULL, 'google-sub', 'pending')");
    expect(await verifyAlumni(details)).toBe("verified");
  });

  it("never lets non-login fixtures or suspended accounts claim a record", async () => {
    shared.userId = await account("('alum-001@synthetic.lumina.local', 'synthetic_not_for_login', NULL, 'active')");
    expect(await verifyAlumni(details)).toBe("unresolved");
    shared.userId = await account("('suspended@example.test', '$argon2id$v=19$m=19456,t=2,p=1$abc$def', NULL, 'suspended')");
    expect(await verifyAlumni(details)).toBe("unresolved");
    expect((await shared.conn!.query("SELECT claimed_by_user_id FROM pg_temp.alumni_registry")).rows[0].claimed_by_user_id).toBeNull();
  });

  it("rejects mismatched details without changing the account", async () => {
    shared.userId = await account("('password2@example.test', '$argon2id$v=19$m=19456,t=2,p=1$abc$def', NULL, 'pending')");
    expect(await verifyAlumni({ ...details, endYear: 2022 })).toBe("unresolved");
    expect(await state(shared.userId)).toEqual({ account_status: "pending", alumni_verified: false });
  });
});
