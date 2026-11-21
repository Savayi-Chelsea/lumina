import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { FeedbackInputError, logSearch, matchQuality, myFeedback, parseFeedback, parseOrigin, recordOrigin, saveFeedback } from "@/lib/match-tracking";
import { requestMentorship } from "@/lib/mentorship-requests";
import { AccountDeletionError, consentHistory, deleteMyAccount, exportMyData, privacySettings, savePrivacy } from "@/lib/privacy";
import { addSlot, bookSlot, bookableSlots, cancelSession, mySessions, mySlots, parseAgenda, parseSlot, removeSlot, SessionInputError } from "@/lib/sessions";
import { listAudit } from "@/lib/audit";
import { setAccountStatus } from "@/lib/admin-users";
import { hashPassword } from "@/lib/passwords";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };
const nairobiDay = (offsetDays: number) => new Date(Date.now() + 3 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
const slotForm = (overrides: Record<string, string> = {}) => form({ date: nairobiDay(3), time: "10:00", duration: "60", mode: "video", details: "https://meet.example.test/abc", ...overrides });

describe("match tracking, privacy and scheduling input", () => {
  it("parses search origins strictly", () => {
    expect(parseOrigin("3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b", "2")).toEqual({ eventId: "3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b", rank: 2 });
    for (const [search, rank] of [["nope", "1"], ["3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b", "0"], ["3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b", "51"], ["3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b", "1e1"], [null, "1"]]) {
      expect(parseOrigin(search, rank)).toBeNull();
    }
  });
  it("validates match ratings", () => {
    expect(parseFeedback(form({ match_rating: "4", would_recommend: "yes", comment: "  Helpful  " }))).toEqual({ rating: 4, recommend: true, comment: "Helpful" });
    expect(() => parseFeedback(form({ match_rating: "6", would_recommend: "yes" }))).toThrow(FeedbackInputError);
    expect(() => parseFeedback(form({ match_rating: "3" }))).toThrow("Say whether you would recommend this mentor.");
    expect(() => parseFeedback(form({ match_rating: "3", would_recommend: "no", comment: "x".repeat(501) }))).toThrow("500 characters");
  });
  it("parses session slots in Nairobi time and rejects bad input", () => {
    const now = new Date("2026-10-21T06:00:00Z");
    const slot = parseSlot(slotForm({ date: "2026-10-24", time: "09:30" }), now);
    expect(slot.start.toISOString()).toBe("2026-10-24T06:30:00.000Z");
    expect(slot.end.toISOString()).toBe("2026-10-24T07:30:00.000Z");
    expect(() => parseSlot(slotForm({ date: "2026-02-30" }), now)).toThrow(SessionInputError);
    expect(() => parseSlot(slotForm({ date: "2026-10-21", time: "09:15" }), now)).toThrow("at least an hour");
    expect(() => parseSlot(slotForm({ date: "2027-03-01" }), now)).toThrow("90 days");
    expect(() => parseSlot(slotForm({ time: "10:10" }), new Date())).toThrow("15-minute");
    expect(() => parseSlot(slotForm({ duration: "20" }), new Date())).toThrow("30, 45, 60 or 90");
    expect(() => parseSlot(slotForm({ mode: "carrier-pigeon" }), new Date())).toThrow("how you'll meet");
    expect(() => parseSlot(slotForm({ details: "javascript:alert(1)" }), new Date())).toThrow("normal meeting link");
    expect(parseAgenda("  ")).toBeNull();
    expect(() => parseAgenda("x".repeat(501))).toThrow(SessionInputError);
  });
});

const TABLES = ["users", "profiles", "mentorship_preferences", "skills", "profile_skills", "work_experience", "profile_photos", "alumni_registry",
  "verification_assistance_requests", "connections", "conversations", "messages", "notifications", "mentorship_requests",
  "mentor_search_events", "mentor_search_results", "mentorship_request_origins", "mentorship_feedback", "privacy_consents",
  "mentor_availability", "mentorship_sessions", "audit_log", "email_preferences", "email_deliveries", "session_recaps", "recap_reactions",
  "event_registrations", "events", "profile_change_outbox"];

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("match tracking, privacy, scheduling and audit on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: Record<string, string>;
  const u: Record<string, string> = {};
  const p: Record<string, string> = {};
  const snapshot = async () => (await shared.conn!.query<Record<string, string>>(`SELECT ${TABLES.map(t => `(SELECT count(*) FROM public.${t}) AS ${t}`).join(", ")}`)).rows[0];

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
  }, 60_000); // 29 temporary tables; slow when every database suite runs in parallel

  beforeEach(async () => {
    for (const table of [...TABLES].reverse()) await shared.conn!.query(`DELETE FROM pg_temp.${table}`);
    const hash = await hashPassword("correct horse battery");
    for (const [key, role] of [["mentor", "alumni"], ["mentee", "alumni"], ["other", "alumni"], ["admin", "admin"]] as const) {
      u[key] = (await shared.conn!.query("INSERT INTO pg_temp.users (email, role, account_status, alumni_verified, password_hash) VALUES ($1, $2, 'active', TRUE, $3) RETURNING id",
        [`${key}@example.test`, role, key === "mentee" ? hash : null])).rows[0].id;
      p[key] = (await shared.conn!.query("INSERT INTO pg_temp.profiles (user_id, full_name, headline) VALUES ($1, $2, 'Headline') RETURNING id", [u[key], key[0].toUpperCase() + key.slice(1)])).rows[0].id;
    }
    await shared.conn!.query("INSERT INTO pg_temp.mentorship_preferences (profile_id, consent_to_matching, available_for_mentorship, mentorship_topics) VALUES ($1, TRUE, TRUE, 'Cloud')", [p.mentor]);
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toEqual(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  it("links a request to the search that produced it and reports quality by rank, without storing search text", async () => {
    const searchId = (await logSearch(u.mentee, "search", [{ profileId: p.other, score: 0.71 }, { profileId: p.mentor, score: 0.66 }]))!;
    expect(searchId).toMatch(/^[0-9a-f-]{36}$/);
    const columns = (await shared.conn!.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'mentor_search_events'")).rows.map(r => r.column_name);
    expect(columns).not.toContain("query");
    // Forged origins are ignored: wrong rank, someone else's search.
    expect(await requestMentorship(u.mentee, p.mentor, { goal: "Cloud", message: "Hello" }, { eventId: searchId, rank: 1 })).toBe("sent");
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.mentorship_request_origins")).rows[0].n).toBe(0);
    const request = (await shared.conn!.query("SELECT id FROM pg_temp.mentorship_requests")).rows[0].id;
    expect(await recordOrigin(shared.conn!, request, u.other, p.mentor, { eventId: searchId, rank: 2 })).toBe(false);
    expect(await recordOrigin(shared.conn!, request, u.mentee, p.mentor, { eventId: searchId, rank: 2 })).toBe(true);
    // Only the mentee of an accepted mentorship can rate it.
    expect(await saveFeedback(u.mentee, request, { rating: 5, recommend: true, comment: null })).toBe(false);
    await shared.conn!.query("UPDATE pg_temp.mentorship_requests SET status = 'accepted', responded_at = created_at + INTERVAL '3 hours'");
    expect(await saveFeedback(u.mentor, request, { rating: 5, recommend: true, comment: null })).toBe(false);
    expect(await saveFeedback(u.mentee, request, { rating: 4, recommend: true, comment: "Good" })).toBe(true);
    expect(await saveFeedback(u.mentee, request, { rating: 5, recommend: true, comment: null })).toBe(true);
    expect((await myFeedback(u.mentee)).get(request)).toMatchObject({ match_rating: 5 });
    const quality = await matchQuality(30);
    expect(quality.searches).toEqual([{ source: "search", events: 1, members: 1, with_results: 1 }]);
    expect(quality.ranks).toEqual([
      expect.objectContaining({ rank: 1, shown: 1, requested: 0 }),
      expect.objectContaining({ rank: 2, shown: 1, requested: 1, accepted: 1, rated: 1, average_rating: 5 }),
    ]);
    expect(quality.requests).toMatchObject({ total: 1, from_search: 1, accepted: 1, median_reply_hours: 3 });
    expect(quality.feedback).toMatchObject({ count: 1, average_rating: 5, recommend_rate: 1, by_source: [{ source: "search", count: 1, average_rating: 5 }] });
  });

  it("books, protects and cancels sessions for the two participants only", async () => {
    const mentorship = (await shared.conn!.query(`INSERT INTO pg_temp.mentorship_requests (mentee_id, mentor_id, goal, message, status, responded_at)
      VALUES ($1, $2, 'Cloud', 'Hi', 'accepted', CURRENT_TIMESTAMP) RETURNING id`, [u.mentee, u.mentor])).rows[0].id;
    const slot = parseSlot(slotForm());
    expect(await addSlot(u.other, slot)).toBe("not_mentor");
    expect(await addSlot(u.mentor, slot)).toBe("added");
    expect(await addSlot(u.mentor, parseSlot(slotForm({ time: "10:30" })))).toBe("overlap");
    expect(await addSlot(u.mentor, parseSlot(slotForm({ time: "11:00" })))).toBe("added");
    const [first, second] = await mySlots(u.mentor);
    expect(await bookableSlots(u.other, mentorship)).toBeNull();
    expect((await bookableSlots(u.mentee, mentorship))!.slots).toHaveLength(2);
    expect(await bookSlot(u.other, mentorship, first.id, null)).toEqual({ outcome: "unavailable" });
    const booked = await bookSlot(u.mentee, mentorship, first.id, "CV review");
    expect(booked.outcome).toBe("booked");
    expect(await bookSlot(u.mentee, mentorship, first.id, null)).toEqual({ outcome: "taken" });
    expect((await shared.conn!.query("SELECT kind FROM pg_temp.notifications WHERE user_id = $1", [u.mentor])).rows).toEqual([{ kind: "session_booked" }]);
    const sessions = await mySessions(u.mentee);
    expect(sessions.upcoming).toEqual([expect.objectContaining({ role: "mentee", other_name: "Mentor", agenda: "CV review", details: "https://meet.example.test/abc" })]);
    const sessionId = (booked as { sessionId: string }).sessionId;
    expect(await cancelSession(u.other, sessionId)).toBeNull();
    expect(await cancelSession(u.mentee, sessionId)).toEqual({ otherId: u.mentor });
    expect((await shared.conn!.query("SELECT status FROM pg_temp.mentor_availability WHERE id = $1", [first.id])).rows[0].status).toBe("open"); // mentee cancelled: slot reopens
    const again = await bookSlot(u.mentee, mentorship, second.id, null) as { sessionId: string };
    expect(await cancelSession(u.mentor, again.sessionId)).toEqual({ otherId: u.mentee });
    expect((await shared.conn!.query("SELECT status FROM pg_temp.mentor_availability WHERE id = $1", [second.id])).rows[0].status).toBe("cancelled"); // mentor cancelled: withdrawn
    expect(await removeSlot(u.other, first.id)).toBe(false);
    expect(await removeSlot(u.mentor, first.id)).toBe(true);
    expect((await mySessions(u.mentee)).cancelled).toHaveLength(2);
  });

  it("records privacy choices, exports the member's data without secrets, and deletes the account while releasing the registry claim", async () => {
    expect(await privacySettings(u.mentee)).toMatchObject({ has_profile: true, show_in_directory: true, profile_visibility: "members", weekly_digest: false, session_emails: true });
    await savePrivacy(u.mentee, { show_in_directory: false, profile_visibility: "connections", weekly_digest: true, session_emails: true });
    expect(await privacySettings(u.mentee)).toMatchObject({ show_in_directory: false, profile_visibility: "connections", weekly_digest: true });
    expect((await consentHistory(u.mentee)).map(c => `${c.kind}:${c.value}`).sort()).toEqual(["directory_listing:hidden", "profile_visibility:connections", "weekly_digest:granted"]);
    await savePrivacy(u.mentee, { show_in_directory: false, profile_visibility: "connections", weekly_digest: true, session_emails: true });
    expect(await consentHistory(u.mentee)).toHaveLength(3); // unchanged choices are not re-recorded

    await shared.conn!.query("INSERT INTO pg_temp.alumni_registry (synthetic_staff_number, surname, former_kq_department, kq_start_year, kq_end_year, claimed_by_user_id, claimed_at) VALUES ('SYN-ALUM-999', 'Mentee', 'ICT', 2000, 2010, $1, CURRENT_TIMESTAMP)", [u.mentee]);
    await shared.conn!.query("INSERT INTO pg_temp.connections (requester_id, addressee_id, status) VALUES ($1, $2, 'accepted')", [u.mentee, u.other]);
    const data = await exportMyData(u.mentee);
    expect(data.account).toMatchObject({ email: "mentee@example.test", has_password: true, has_google_sign_in: false });
    expect(data.registry_record).toMatchObject({ staff_number: "SYN-ALUM-999" });
    expect(data.connections).toEqual([expect.objectContaining({ person: "Other", direction: "sent", status: "accepted" })]);
    const text = JSON.stringify(data);
    expect(text).not.toContain("argon2");
    expect(text).not.toContain(u.other);

    await expect(deleteMyAccount(u.mentee, "delete", "correct horse battery")).rejects.toThrow("Type DELETE");
    await expect(deleteMyAccount(u.mentee, "DELETE", "wrong")).rejects.toThrow(AccountDeletionError);
    await expect(deleteMyAccount(u.admin, "DELETE", null)).rejects.toThrow("Administrator accounts");
    await deleteMyAccount(u.mentee, "DELETE", "correct horse battery");
    expect((await shared.conn!.query("SELECT count(*)::int AS n FROM pg_temp.users WHERE id = $1", [u.mentee])).rows[0].n).toBe(0);
    expect((await shared.conn!.query("SELECT claimed_by_user_id FROM pg_temp.alumni_registry")).rows[0].claimed_by_user_id).toBeNull();
    // Temporary copies have no foreign keys, so check the real schema instead: everything that belongs to a
    // member cascades (or is detached) on deletion, except the two references deleteMyAccount clears itself.
    const blocking = (await shared.conn!.query(`SELECT DISTINCT t.relname || '.' || a.attname AS reference
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass AND c.confdeltype NOT IN ('c', 'n') ORDER BY 1`)).rows.map(r => r.reference);
    expect(blocking).toEqual(["alumni_registry.claimed_by_user_id", "verification_assistance_requests.resolved_by_user_id", "verification_assistance_requests.user_id"]);
    const audit = await listAudit({ action: null, page: 1 });
    expect(audit.entries.map(e => e.action)).toEqual(["account.delete", "account.export"]);
  });

  it("writes admin actions to the audit log in the same statement as the change", async () => {
    expect(await setAccountStatus(u.admin, u.other, "suspend")).toBe(true);
    expect(await setAccountStatus(u.admin, u.other, "suspend")).toBe(false); // nothing changed, nothing logged
    expect(await setAccountStatus(u.admin, u.other, "reinstate")).toBe(true);
    const { entries, total } = await listAudit({ action: null, page: 1 });
    expect(total).toBe(2);
    expect(entries.map(e => [e.action, e.target_id, e.actor_name])).toEqual([["user.reinstate", u.other, "Admin"], ["user.suspend", u.other, "Admin"]]);
    expect((await listAudit({ action: "user.suspend", page: 1 })).total).toBe(1);
    expect((await listAudit({ action: "made.up", page: 1 })).action).toBeNull();
  });

  it("keeps the real audit log append-only", async () => {
    await shared.conn!.query("BEGIN");
    try {
      const id = (await shared.conn!.query("INSERT INTO public.audit_log (action, target_type) VALUES ('test.append_only', 'test') RETURNING id")).rows[0].id;
      await shared.conn!.query("SAVEPOINT edit");
      await expect(shared.conn!.query("UPDATE public.audit_log SET action = 'tampered' WHERE id = $1", [id])).rejects.toThrow("append-only");
      await shared.conn!.query("ROLLBACK TO SAVEPOINT edit");
      await expect(shared.conn!.query("DELETE FROM public.audit_log WHERE id = $1", [id])).rejects.toThrow("append-only");
    } finally {
      await shared.conn!.query("ROLLBACK");
    }
  });
});
