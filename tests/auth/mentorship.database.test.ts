import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { discoverableMentors } from "@/lib/mentor-profiles";
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ database: () => ({ query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args) }) }));
describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("mentor profile relation and consent in PostgreSQL", () => {
  let pool: Pool;
  const id = "11111111-1111-1111-1111-111111111111";
  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url?.hostname || process.env.POSTGRES_HOST || "localhost") || (url ? url.pathname.slice(1) : process.env.POSTGRES_DB) !== "lumina") throw new Error("Local lumina database required");
    pool = new Pool(url ? { connectionString: process.env.DATABASE_URL } : { host: process.env.POSTGRES_HOST || "localhost", port: Number(process.env.POSTGRES_PORT || "5432"), user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
    shared.conn = await pool.connect();
    for (const table of ["users", "profiles", "mentorship_preferences", "skills", "profile_skills"]) await shared.conn.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
    await shared.conn.query("INSERT INTO users(id,email,account_status) VALUES($1,'fixture@synthetic.lumina.local','active')",[id]);
    await shared.conn.query("INSERT INTO profiles(id,user_id,full_name,biography) VALUES($1,$1,'Synthetic Mentor','Professional biography')",[id]);
    await shared.conn.query("INSERT INTO mentorship_preferences(profile_id,available_for_mentorship,consent_to_matching) VALUES($1,true,true)",[id]);
  });
  afterAll(async () => { shared.conn?.release(); await pool?.end(); });
  it("resolves the profile name and exposes only professional fields", async () => {
    const profile = (await discoverableMentors([id]))[0];
    expect(profile).toMatchObject({ full_name: "Synthetic Mentor", biography: "Professional biography", synthetic: true, skills: [] });
    expect(Object.keys(profile)).not.toContain("email"); expect(Object.keys(profile)).not.toContain("user_id");
  });
  it("suppresses withdrawn consent, unavailable and suspended profiles, including direct views", async () => {
    await shared.conn!.query("UPDATE mentorship_preferences SET consent_to_matching=false"); expect(await discoverableMentors([id])).toEqual([]);
    await shared.conn!.query("UPDATE mentorship_preferences SET consent_to_matching=true,available_for_mentorship=false"); expect(await discoverableMentors([id])).toEqual([]);
    await shared.conn!.query("UPDATE mentorship_preferences SET available_for_mentorship=true");
    await shared.conn!.query("UPDATE users SET account_status='suspended'"); expect(await discoverableMentors([id])).toEqual([]);
  });
});
