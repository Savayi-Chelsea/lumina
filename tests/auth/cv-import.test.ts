import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { importFromCv, parseCvImport, ProfileInputError } from "@/lib/profile-editor";
import { linesFromItems } from "@/lib/cv-text";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

const today = new Date("2026-11-22T09:00:00Z");
const payload = (value: unknown) => JSON.stringify(value);
const role = { job_title: "Cloud Engineer", organization: "CloudWorks Africa", start: "2023-01", end: null, is_current: true, description: "Runs AWS." };

describe("CV import: text from PDF fragments", () => {
  it("rebuilds lines from positioned fragments in document order, adding spaces at visible gaps", () => {
    const item = (str: string, x: number, y: number, width: number, hasEOL = false) => ({ str, x, y, width, hasEOL });
    expect(linesFromItems([[item("Work", 50, 700, 30), item("experience", 84, 700, 60), item("Cloud", 50, 680, 30), item("Engineer", 84, 680, 45, true),
      item("Jan 2023 – ", 50, 660, 55), item("Present", 105, 660, 40)], [item("Skills", 50, 700, 30)]])).toBe("Work experience\nCloud Engineer\nJan 2023 – Present\nSkills");
  });
});

describe("CV import: validating what the member confirmed", () => {
  it("accepts ticked fields, roles, KQ years and skills, de-duplicating skills", () => {
    const parsed = parseCvImport(payload({ fields: { headline: " Cloud Engineer ", location: "Nairobi", unknown: "ignored" }, kq_start_year: 2018, kq_end_year: "2022",
      experience: [role, { ...role, job_title: "Systems Administrator", organization: "Kenya Airways", start: "2018-03", end: "2022-12", is_current: false, description: "" }],
      skills: ["AWS", "aws", "Terraform"] }), today);
    expect(parsed.fields).toEqual({ headline: "Cloud Engineer", location: "Nairobi" });
    expect([parsed.kq_start_year, parsed.kq_end_year]).toEqual([2018, 2022]);
    expect(parsed.experience).toEqual([
      { job_title: "Cloud Engineer", organization: "CloudWorks Africa", start_date: "2023-01-01", end_date: null, is_current: true, description: "Runs AWS." },
      { job_title: "Systems Administrator", organization: "Kenya Airways", start_date: "2018-03-01", end_date: "2022-12-01", is_current: false, description: null },
    ]);
    expect(parsed.skills).toEqual(["AWS", "Terraform"]);
  });

  it("applies the same rules as the profile editors", () => {
    const bad = (value: unknown, message: RegExp) => expect(() => parseCvImport(payload(value), today)).toThrow(message);
    bad({ fields: { headline: "x".repeat(201) } }, /headline must be 200 characters/);
    bad({ fields: { location: "Nairobi\u0007" } }, /unsupported characters/);
    bad({ experience: [{ ...role, start: "2027-01" }] }, /Role 1 start must be a month no later than this month/);
    bad({ experience: [{ ...role, is_current: false, end: "2022-12" }] }, /Role 1 must end on or after its start/);
    bad({ experience: [{ ...role, organization: " " }] }, /Role 1 needs a title and an organization/);
    bad({ kq_start_year: 1970 }, /KQ start year must be between 1977/);
    bad({ kq_start_year: 2020, kq_end_year: 2019 }, /KQ end year must be on or after/);
    bad({ skills: Array.from({ length: 31 }, (_, i) => `Skill ${i}`) }, /at most 30 skills/);
    bad({ experience: Array.from({ length: 16 }, () => role) }, /at most 15 roles/);
    expect(() => parseCvImport("{not json", today)).toThrow(ProfileInputError);
    expect(() => parseCvImport(null, today)).toThrow(ProfileInputError);
    expect(() => parseCvImport("x".repeat(100_001), today)).toThrow(ProfileInputError);
  });
});

const TABLES = ["users", "profiles", "skills", "profile_skills", "work_experience", "profile_change_outbox"];

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("CV import: saving on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: string;
  let profileId: string;
  const snapshot = async () => JSON.stringify((await shared.conn!.query(`SELECT ${TABLES.map(t => `(SELECT count(*) FROM public.${t}) AS ${t}`).join(", ")}`)).rows);

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
    for (const table of TABLES) await shared.conn.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  });

  beforeEach(async () => {
    for (const table of [...TABLES].reverse()) await shared.conn!.query(`DELETE FROM pg_temp.${table}`);
    const user = (await shared.conn!.query("INSERT INTO pg_temp.users(email, account_status, alumni_verified) VALUES ('cv@example.test','active',TRUE) RETURNING id")).rows[0].id;
    profileId = (await shared.conn!.query("INSERT INTO pg_temp.profiles(user_id, full_name, headline) VALUES ($1, 'Grace Example', 'Old headline') RETURNING id", [user])).rows[0].id;
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toBe(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  it("saves the confirmed details in one go, completes the profile and queues re-indexing", async () => {
    const input = parseCvImport(payload({ fields: { headline: "Cloud Engineer", former_kq_role: "Systems Administrator", former_kq_department: "ICT / Digital" },
      kq_start_year: 2018, kq_end_year: 2022, experience: [role], skills: ["AWS", "Terraform"] }), today);
    expect(await importFromCv(profileId, input)).toEqual({ fields: 5, roles: 1, skills: 2, overLimit: 0 });
    const profile = (await shared.conn!.query("SELECT headline, former_kq_role, kq_start_year, kq_end_year, profile_completed FROM pg_temp.profiles WHERE id = $1", [profileId])).rows[0];
    expect(profile).toEqual({ headline: "Cloud Engineer", former_kq_role: "Systems Administrator", kq_start_year: 2018, kq_end_year: 2022, profile_completed: true });
    expect((await shared.conn!.query("SELECT job_title, start_date::text, is_current FROM pg_temp.work_experience")).rows).toEqual([{ job_title: "Cloud Engineer", start_date: "2023-01-01", is_current: true }]);
    expect((await shared.conn!.query("SELECT reason FROM pg_temp.profile_change_outbox")).rows).toEqual([{ reason: "cv_import" }]);
  });

  it("does not duplicate roles or skills on a second import, and respects the 30-skill limit", async () => {
    const input = parseCvImport(payload({ experience: [role], skills: ["AWS"] }), today);
    await importFromCv(profileId, input);
    expect(await importFromCv(profileId, parseCvImport(payload({ experience: [{ ...role, job_title: "cloud engineer" }], skills: ["aws"] }), today)))
      .toEqual({ fields: 0, roles: 0, skills: 0, overLimit: 0 });
    const many = parseCvImport(payload({ skills: Array.from({ length: 30 }, (_, i) => `Skill number ${i}`) }), today);
    expect(await importFromCv(profileId, many)).toEqual({ fields: 0, roles: 0, skills: 29, overLimit: 1 });
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.profile_skills")).rows[0].n).toBe(30);
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.profile_change_outbox")).rows[0].n).toBe(2);
  });
});
