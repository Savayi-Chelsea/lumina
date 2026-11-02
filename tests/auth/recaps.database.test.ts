import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import {
  adminRecaps, createRecap, decideRecap, parseRecap, pendingRecapCount, recapDrafts, recapFeed, recapPartners, recapsForProfile,
  RecapInputError, setRecapHidden, toggleReaction, withdrawRecap,
} from "@/lib/session-recaps";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const MENTORSHIP = "3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b";
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const valid = { mentorship_id: MENTORSHIP, topic: "Moving into cloud", session_date: daysAgo(3), takeaways: "We planned a first certification and a small project." };

describe("session recap input", () => {
  it("accepts a valid recap and trims text", () => {
    expect(parseRecap(form({ ...valid, topic: "  Moving into cloud  " }))).toEqual({ mentorshipId: MENTORSHIP, topic: "Moving into cloud", sessionDate: valid.session_date, takeaways: valid.takeaways });
  });
  it.each([
    [{ mentorship_id: "not-a-uuid" }, "Choose who the session was with."],
    [{ topic: "" }, "Add a topic for the session."],
    [{ topic: "x".repeat(121) }, "The topic must be 120 characters or fewer."],
    [{ takeaways: "Too short" }, "Share at least 20 characters about what you covered."],
    [{ takeaways: "x".repeat(1501) }, "Takeaways must be 1500 characters or fewer."],
    [{ session_date: daysAgo(-2) }, "The session date can't be in the future."],
    [{ session_date: "2026-02-30" }, "Choose the date of the session."],
    [{ session_date: daysAgo(6 * 365) }, "The session date must be within the last five years."],
    [{ takeaways: "Takeaways with a \u0007 bell character inside." }, "Remove unsupported characters."],
  ])("rejects %j", (change, message) => {
    expect(() => parseRecap(form({ ...valid, ...change }))).toThrow(new RecapInputError(message));
  });
});

const TABLES = ["users", "profiles", "mentorship_requests", "session_recaps", "recap_reactions", "notifications", "audit_log"];

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("session recaps on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: string;
  const u: Record<string, string> = {};
  const p: Record<string, string> = {};
  let mentorship = "";
  const snapshot = async () => JSON.stringify((await shared.conn!.query(`SELECT ${TABLES.map(t => `(SELECT count(*) FROM public.${t}) AS ${t}`).join(", ")}`)).rows);
  const input = (overrides: Partial<typeof valid> = {}) => parseRecap(form({ ...valid, mentorship_id: mentorship, ...overrides }));

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
    for (const [key, status, verified] of [["mentor", "active", true], ["mentee", "active", true], ["reader", "active", true], ["outsider", "active", true], ["admin", "active", false]] as const) {
      u[key] = (await shared.conn!.query("INSERT INTO pg_temp.users (email, account_status, alumni_verified, role) VALUES ($1, $2, $3, $4) RETURNING id",
        [`${key}@example.test`, status, verified, key === "admin" ? "admin" : "alumni"])).rows[0].id;
      p[key] = (await shared.conn!.query("INSERT INTO pg_temp.profiles (user_id, full_name) VALUES ($1, $2) RETURNING id", [u[key], key[0].toUpperCase() + key.slice(1)])).rows[0].id;
    }
    mentorship = (await shared.conn!.query(`INSERT INTO pg_temp.mentorship_requests (mentee_id, mentor_id, goal, message, status, responded_at)
      VALUES ($1, $2, 'Cloud careers', 'Hello', 'accepted', CURRENT_TIMESTAMP) RETURNING id`, [u.mentee, u.mentor])).rows[0].id;
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toBe(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  it("publishes a recap only after the other person approves it", async () => {
    expect(await recapPartners(u.mentee)).toEqual([expect.objectContaining({ mentorship_id: mentorship, role: "mentor", name: "Mentor" })]);
    expect(await recapPartners(u.mentor)).toEqual([expect.objectContaining({ role: "mentee", name: "Mentee" })]);
    expect(await createRecap(u.mentee, input())).toBe("sent");
    expect(await createRecap(u.mentor, input())).toBe("duplicate"); // one pending recap per mentorship
    expect((await recapFeed(u.reader)).total).toBe(0);
    expect(await pendingRecapCount(u.mentor)).toBe(1);
    const { toReview } = await recapDrafts(u.mentor);
    expect(toReview).toEqual([expect.objectContaining({ topic: "Moving into cloud", other_name: "Mentee", status: "pending" })]);
    expect((await recapDrafts(u.mentee)).mine).toHaveLength(1);
    expect(await decideRecap(u.mentee, toReview[0].id, true)).toBe(false); // the author cannot approve their own recap
    expect(await decideRecap(u.outsider, toReview[0].id, true)).toBe(false);
    expect(await decideRecap(u.mentor, toReview[0].id, true)).toBe(true);
    expect(await decideRecap(u.mentor, toReview[0].id, false)).toBe(false); // already decided
    const feed = await recapFeed(u.reader);
    expect(feed.total).toBe(1);
    expect(feed.recaps[0]).toMatchObject({ topic: "Moving into cloud", mentor: { name: "Mentor", profile_id: p.mentor }, mentee: { name: "Mentee", profile_id: p.mentee }, reactions: 0, reacted: false, hidden: false });
    expect(await recapsForProfile(u.reader, p.mentor)).toHaveLength(1);
    expect(await recapsForProfile(u.reader, p.mentee)).toHaveLength(1);
    expect(await recapsForProfile(u.reader, p.reader)).toHaveLength(0);
    expect(JSON.stringify(feed)).not.toMatch(new RegExp([u.mentor, u.mentee].join("|"))); // no internal user ids
  });

  it("refuses recaps outside an accepted mentorship and supports decline and withdraw", async () => {
    expect(await createRecap(u.outsider, input())).toBe("unavailable");
    await shared.conn!.query("UPDATE pg_temp.mentorship_requests SET status = 'withdrawn'");
    expect(await createRecap(u.mentee, input())).toBe("unavailable");
    await shared.conn!.query("UPDATE pg_temp.mentorship_requests SET status = 'accepted'");
    expect(await createRecap(u.mentee, input())).toBe("sent");
    const [draft] = (await recapDrafts(u.mentor)).toReview;
    expect(await withdrawRecap(u.mentor, draft.id)).toBe(false); // only the author withdraws
    expect(await withdrawRecap(u.mentee, draft.id)).toBe(true);
    expect(await createRecap(u.mentee, input({ topic: "Second try" }))).toBe("sent");
    const [second] = (await recapDrafts(u.mentor)).toReview;
    expect(await decideRecap(u.mentor, second.id, false)).toBe(true);
    expect((await recapFeed(u.reader)).total).toBe(0);
    expect((await recapDrafts(u.mentee)).mine).toEqual([expect.objectContaining({ topic: "Second try", status: "declined" })]);
  });

  it("toggles reactions, hides recaps of members who are no longer active, and lets admins hide and restore", async () => {
    await createRecap(u.mentor, input());
    const [draft] = (await recapDrafts(u.mentee)).toReview;
    await decideRecap(u.mentee, draft.id, true);
    expect(await toggleReaction(u.reader, draft.id)).toBe(true);
    expect((await recapFeed(u.reader)).recaps[0]).toMatchObject({ reactions: 1, reacted: true });
    expect((await recapFeed(u.outsider)).recaps[0]).toMatchObject({ reactions: 1, reacted: false });
    expect(await toggleReaction(u.reader, draft.id)).toBe(true);
    expect((await recapFeed(u.reader)).recaps[0]).toMatchObject({ reactions: 0, reacted: false });
    expect(await toggleReaction(u.reader, "not-a-uuid")).toBe(false);

    await shared.conn!.query("UPDATE pg_temp.users SET account_status = 'suspended' WHERE id = $1", [u.mentee]);
    expect((await recapFeed(u.reader)).total).toBe(0);
    expect(await toggleReaction(u.reader, draft.id)).toBe(false);
    await shared.conn!.query("UPDATE pg_temp.users SET account_status = 'active' WHERE id = $1", [u.mentee]);

    expect(await setRecapHidden(u.admin, draft.id, true)).toBe(true);
    expect(await setRecapHidden(u.admin, draft.id, true)).toBe(false);
    expect((await recapFeed(u.reader)).total).toBe(0);
    expect(await recapsForProfile(u.reader, p.mentor)).toHaveLength(0);
    expect((await adminRecaps(u.admin)).recaps).toEqual([expect.objectContaining({ id: draft.id, hidden: true })]);
    expect(await setRecapHidden(u.admin, draft.id, false)).toBe(true);
    expect((await recapFeed(u.reader)).total).toBe(1);
  });
});
