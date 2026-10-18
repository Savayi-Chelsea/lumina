import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { alumniProfile, directoryOptions, homeAlumni, searchAlumni } from "@/lib/alumni-directory";
import { parseDirectoryQuery } from "@/lib/network-query";
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ database: () => ({ query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args) }) }));
const id = (n: number) => `11111111-1111-1111-1111-${String(n).padStart(12,"0")}`;
const search = (params = {}) => searchAlumni(parseDirectoryQuery(params));
describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("Network queries on isolated PostgreSQL fixtures", () => {
 let pool: Pool;
 beforeAll(async () => {
   loadEnvConfig(process.cwd());
   const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
   if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url?.hostname || process.env.POSTGRES_HOST || "localhost") || (url ? url.pathname.slice(1) : process.env.POSTGRES_DB) !== "lumina") throw new Error("Local lumina database required");
   pool = new Pool(url ? { connectionString: process.env.DATABASE_URL } : { host: process.env.POSTGRES_HOST || "localhost", port: Number(process.env.POSTGRES_PORT || 5432), user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB });
   shared.conn = await pool.connect();
   for (const table of ["users", "profiles", "skills", "profile_skills", "mentorship_preferences", "work_experience"]) await shared.conn.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
   for (let n=1; n<=18; n++) {
     await shared.conn.query("INSERT INTO users(id,email,account_status,alumni_verified,role) VALUES($1,$2,$3,$4,$5)", [id(n), `network${n}@example.test`, n===15 ? "pending" : n===16 ? "suspended" : "active", n!==17, n===18 ? "admin" : "alumni"]);
     await shared.conn.query("INSERT INTO profiles(id,user_id,full_name,headline,former_kq_role,former_kq_department,current_job_title,current_organization,industry,location) VALUES($1,$1,$2,$3,$4,$5,$6,$7,$8,$9)", [id(n), n===14 ? " " : `Alumnus ${String(n).padStart(2,"0")}`, n===1 ? "Cloud 100%_expert" : "Professional story", n===1 ? "Systems Engineer" : "Crew", n<=2 ? "ICT / Digital" : n>=14 ? "Hidden department" : "Operations", n===1 ? "Architect" : null, n===1 ? "Lumina Labs" : null, n<=2 ? "Technology" : "Aviation", n===1 ? "Nairobi" : "Mombasa"]);
   }
   await shared.conn.query("INSERT INTO skills(id,name) VALUES($1,'AWS')", [id(1)]);
   await shared.conn.query("INSERT INTO profile_skills(profile_id,skill_id) VALUES($1,$1)", [id(1)]);
   await shared.conn.query("INSERT INTO mentorship_preferences(profile_id,available_for_mentorship,consent_to_matching,mentorship_topics) VALUES($1,true,false,'Private preference')", [id(1)]);
   await shared.conn.query("INSERT INTO work_experience(profile_id,organization,job_title,is_current,start_date) VALUES($1,'Example','Engineer',true,'2020-01-01')", [id(1)]);
 });
 afterAll(async () => { shared.conn?.release(); await pool?.end(); });
 it("paginates deterministically and excludes pending, suspended, unverified, admin and blank profiles", async () => {
   const first = await search(); expect(first.total).toBe(13); expect(first.profiles).toHaveLength(12); expect(first.pages).toBe(2);
   const second = await search({ page: "2" }); expect(second.profiles.map(p => p.id)).toEqual([id(13)]);
   expect((await search({ page: "999" })).page).toBe(2);
   expect(first.profiles.map(p => p.id)).not.toContain(id(14));
 });
 it.each(["Alumnus 01", "Cloud", "Systems Engineer", "Architect", "Lumina Labs"])("searches professional fields: %s", async q => { expect((await search({ q })).profiles.map(p => p.id)).toEqual([id(1)]); });
 it("escapes wildcard characters and binds injection as data", async () => {
   expect((await search({ q: "100%_" })).total).toBe(1);
   expect((await search({ q: "%" })).total).toBe(1);
   expect((await search({ q: "' OR 1=1 --" })).total).toBe(0);
   expect((await search({ department: "' OR 1=1 --" })).total).toBe(0);
 });
 it("combines department, industry, skills and location filters", async () => {
   expect((await search({ department: "ICT / Digital" })).total).toBe(2);
   expect((await search({ industry: "Technology" })).total).toBe(2);
   expect((await search({ skill: "AWS" })).total).toBe(1);
   expect((await search({ department: "ICT / Digital", industry: "Technology", skill: "AWS", location: "Nairobi" })).total).toBe(1);
   expect((await search({ location: "Unknown" })).total).toBe(0);
 });
 it("does not publish filter values from hidden profiles", async () => { expect((await directoryOptions()).department).toEqual(["ICT / Digital", "Operations"]); });
 it("uses the same visibility rule for UUID lookup and includes work history without mentorship consent", async () => {
   const profile = await alumniProfile(id(1)); expect(profile?.experience[0].organization).toBe("Example"); expect(profile?.mentorship_available).toBe(false); expect(profile?.mentorship_topics).toBeNull();
   expect(profile?.skills).toEqual(["AWS"]);
   for (const n of [14,15,16,17,18]) expect(await alumniProfile(id(n))).toBeNull();
   expect(await alumniProfile("invalid")).toBeNull();
   const json = JSON.stringify(profile); for (const field of ["google_subject", "password", "account_status", "alumni_verified", "embedding", "source_hash", "email", "user_id"]) expect(json).not.toContain(field);
 });
 it("prioritizes the viewer department on Home, excludes self and limits results", async () => { const people = await homeAlumni(id(1), "ICT / Digital"); expect(people).toHaveLength(3); expect(people[0].id).toBe(id(2)); expect(people.map(p => p.id)).not.toContain(id(1)); });
 it("shows mentorship topics only with both availability and consent", async () => {
   await shared.conn!.query("UPDATE mentorship_preferences SET consent_to_matching=true WHERE profile_id=$1", [id(1)]);
   expect((await alumniProfile(id(1)))?.mentorship_available).toBe(true);
   expect((await alumniProfile(id(1)))?.mentorship_topics).toBe("Private preference");
   await shared.conn!.query("UPDATE mentorship_preferences SET consent_to_matching=false WHERE profile_id=$1", [id(1)]);
 });

});
