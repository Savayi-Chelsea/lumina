import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { connectionCount, connectionState, myNetwork, removeConnection, requestConnection, respondToConnection, suggestions } from "@/lib/social";
import { canMessage, listConversations, openConversation, readConversation, sendMessage } from "@/lib/messages";
import { mentorshipRequests, requestMentorship, respondToMentorship, withdrawMentorship } from "@/lib/mentorship-requests";
import { activityCounts, listNotifications, markNotificationsRead } from "@/lib/notifications";
import { addSkill, deleteExperience, listExperience, parseExperience, photoType, removeSkill, saveExperience, saveMentorshipSettings, savePhoto, readPhoto, ProfileInputError } from "@/lib/profile-editor";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

const TABLES = ["users", "profiles", "skills", "profile_skills", "work_experience", "mentorship_preferences", "profile_photos",
  "connections", "conversations", "messages", "mentorship_requests", "notifications", "profile_change_outbox"];
const form = (values: Record<string, string>) => { const data = new FormData(); for (const [k, v] of Object.entries(values)) data.set(k, v); return data; };

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("connections, messaging, mentorship and profile editing on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: string;
  const u: Record<string, string> = {};
  const p: Record<string, string> = {};
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
    for (const [key, status, verified, department] of [["amina", "active", true, "ICT / Digital"], ["brian", "active", true, "ICT / Digital"], ["chebet", "active", true, "Finance"], ["pending", "pending", false, "ICT / Digital"]] as const) {
      u[key] = (await shared.conn!.query("INSERT INTO pg_temp.users (email, account_status, alumni_verified, google_subject) VALUES ($1, $2, $3, $4) RETURNING id", [`${key}@example.test`, status, verified, `google-${key}`])).rows[0].id;
      p[key] = (await shared.conn!.query("INSERT INTO pg_temp.profiles (user_id, full_name, headline, former_kq_department) VALUES ($1, $2, 'Headline', $3) RETURNING id", [u[key], key[0].toUpperCase() + key.slice(1), department])).rows[0].id;
    }
    await shared.conn!.query("INSERT INTO pg_temp.mentorship_preferences (profile_id, consent_to_matching, available_for_mentorship, mentorship_topics) VALUES ($1, TRUE, TRUE, 'Cloud careers')", [p.brian]);
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toBe(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  it("runs the full connection lifecycle with notifications", async () => {
    expect(await connectionState(u.amina, u.brian)).toMatchObject({ state: "none" });
    expect(await requestConnection(u.amina, p.brian)).toBe("sent");
    expect(await requestConnection(u.amina, p.brian)).toBe("already");
    expect((await connectionState(u.amina, u.brian)).state).toBe("outgoing");
    expect((await connectionState(u.brian, u.amina)).state).toBe("incoming");
    expect((await activityCounts(u.brian)).notifications).toBe(1);
    const { incoming } = await myNetwork(u.brian);
    expect(incoming.map(person => person.full_name)).toEqual(["Amina"]);
    expect(await respondToConnection(u.amina, incoming[0].connection_id, true)).toBe(false); // only the addressee may answer
    expect(await respondToConnection(u.brian, incoming[0].connection_id, true)).toBe(true);
    expect(await connectionCount(u.amina)).toBe(1);
    expect((await listNotifications(u.amina))[0]).toMatchObject({ kind: "connection_accepted", actor_name: "Brian" });
    expect(await removeConnection(u.chebet, incoming[0].connection_id)).toBe(false);
    expect(await removeConnection(u.amina, incoming[0].connection_id)).toBe(true);
    expect((await connectionState(u.amina, u.brian)).state).toBe("none");
  });

  it("accepts a crossing request instead of duplicating, allows re-requesting after a decline, and refuses unverified targets", async () => {
    expect(await requestConnection(u.amina, p.chebet)).toBe("sent");
    expect(await requestConnection(u.chebet, p.amina)).toBe("accepted");
    expect((await connectionState(u.amina, u.chebet)).state).toBe("connected");
    expect(await requestConnection(u.brian, p.chebet)).toBe("sent");
    const pending = (await myNetwork(u.chebet)).incoming[0];
    expect(await respondToConnection(u.chebet, pending.connection_id, false)).toBe(true);
    expect(await requestConnection(u.brian, p.chebet)).toBe("sent");
    expect(await requestConnection(u.amina, p.pending)).toBe("unavailable");
    expect(await requestConnection(u.amina, p.amina)).toBe("unavailable");
  });

  it("only lets connected members message, tracks unread counts and marks them read", async () => {
    expect(await openConversation(u.amina, u.brian)).toBeNull();
    await requestConnection(u.amina, p.brian);
    await requestConnection(u.brian, p.amina);
    expect(await canMessage(shared.conn!, u.amina, u.brian)).toBe(true);
    const id = (await openConversation(u.amina, u.brian))!;
    expect(await openConversation(u.brian, u.amina)).toBe(id);
    expect(await sendMessage(u.amina, id, "  Hello Brian  ")).toBe("sent");
    expect(await sendMessage(u.amina, id, "Second message")).toBe("sent");
    expect(await sendMessage(u.amina, id, " ")).toBe("invalid");
    expect(await sendMessage(u.amina, id, "x".repeat(2001))).toBe("invalid");
    expect(await sendMessage(u.chebet, id, "Intruder")).toBe("forbidden");
    expect(await activityCounts(u.brian)).toMatchObject({ messages: 2 });
    expect((await listNotifications(u.brian)).filter(n => n.kind === "message")).toHaveLength(1);
    expect((await listConversations(u.brian))[0]).toMatchObject({ unread: 2, last_body: "Second message", other_name: "Amina" });
    const thread = (await readConversation(u.brian, id))!;
    expect(thread.messages.map(message => message.body)).toEqual(["Hello Brian", "Second message"]);
    expect(await activityCounts(u.brian)).toMatchObject({ messages: 0 });
    expect(await readConversation(u.chebet, id)).toBeNull();
    const connection = (await myNetwork(u.amina)).connections[0];
    await removeConnection(u.amina, connection.connection_id);
    expect(await sendMessage(u.amina, id, "After removal")).toBe("forbidden");
  });

  it("runs mentorship requests: duplicate guard, accept opens a conversation, decline and withdraw", async () => {
    const input = { goal: "Move into cloud", message: "I'd value your advice." };
    expect(await requestMentorship(u.amina, p.brian, input)).toBe("sent");
    expect(await requestMentorship(u.amina, p.brian, input)).toBe("duplicate");
    expect(await requestMentorship(u.amina, p.chebet, input)).toBe("unavailable"); // not offering mentorship
    expect(await requestMentorship(u.brian, p.brian, input)).toBe("unavailable");
    const incoming = (await mentorshipRequests(u.brian)).incoming;
    expect(incoming[0]).toMatchObject({ goal: "Move into cloud", status: "pending", other_name: "Amina" });
    expect(await respondToMentorship(u.amina, incoming[0].id, true)).toBeNull();
    const accepted = (await respondToMentorship(u.brian, incoming[0].id, true))!;
    expect(accepted.status).toBe("accepted");
    expect(await canMessage(shared.conn!, u.amina, u.brian)).toBe(true);
    const thread = (await readConversation(u.amina, accepted.conversationId!))!;
    expect(thread.messages[0].body).toContain("Move into cloud");
    expect((await listNotifications(u.amina))[0].kind).toBe("mentorship_accepted");
    await shared.conn!.query("INSERT INTO pg_temp.mentorship_preferences (profile_id, consent_to_matching, available_for_mentorship) VALUES ($1, TRUE, TRUE)", [p.chebet]);
    expect(await requestMentorship(u.amina, p.chebet, input)).toBe("sent");
    const second = (await mentorshipRequests(u.amina)).outgoing.find(request => request.status === "pending")!;
    expect(await withdrawMentorship(u.brian, second.id)).toBe(false);
    expect(await withdrawMentorship(u.amina, second.id)).toBe(true);
    await markNotificationsRead(u.amina);
    expect((await activityCounts(u.amina)).notifications).toBe(0);
  });

  it("suggests same-department colleagues you are not connected with", async () => {
    expect((await suggestions(u.amina)).map(person => person.full_name)).toEqual(["Brian", "Chebet"]);
    await requestConnection(u.amina, p.brian);
    expect((await suggestions(u.amina)).map(person => person.full_name)).toEqual(["Chebet"]);
  });

  it("edits experience, skills and mentorship settings, writing an outbox event for each change", async () => {
    const outbox = async () => (await shared.conn!.query("SELECT reason FROM pg_temp.profile_change_outbox WHERE profile_id = $1 ORDER BY id", [p.amina])).rows.map(row => row.reason);
    const entry = parseExperience(form({ job_title: "Cloud Engineer", organization: "Kijani", start_month: "2021-03", is_current: "on" }));
    expect(await saveExperience(p.amina, entry)).toBe(true);
    const [saved] = await listExperience(p.amina);
    expect(saved).toMatchObject({ job_title: "Cloud Engineer", start_date: "2021-03-01", end_date: null, is_current: true });
    expect(await saveExperience(p.brian, entry, saved.id)).toBe(false); // someone else's entry
    expect(await deleteExperience(p.amina, saved.id)).toBe(true);
    expect(await addSkill(p.amina, "Kubernetes")).toBe("added");
    expect(await addSkill(p.amina, "kubernetes")).toBe("exists");
    const skill = (await shared.conn!.query("SELECT id FROM pg_temp.skills WHERE name = 'Kubernetes'")).rows[0].id;
    expect(await removeSkill(p.amina, skill)).toBe(true);
    await saveMentorshipSettings(p.amina, { consent_to_matching: true, available_for_mentorship: true, mentorship_topics: "Cloud|DevOps" });
    expect(await outbox()).toEqual(["experience", "experience", "skills", "skills", "mentorship"]);
    expect(() => parseExperience(form({ job_title: "X", organization: "Y", start_month: "2022-05", end_month: "2021-01" }))).toThrow(ProfileInputError);
    expect(() => parseExperience(form({ job_title: "X", organization: "Y", start_month: "2999-01", is_current: "on" }))).toThrow("no later than this month");
  });

  it("stores only real images and shows photos to permitted viewers", async () => {
    const jpeg = new Uint8Array(200).fill(7); jpeg.set([0xff, 0xd8, 0xff]);
    expect(photoType(jpeg)).toBe("image/jpeg");
    expect(photoType(new TextEncoder().encode("<svg onload=alert(1)>".padEnd(200)))).toBeNull();
    await expect(savePhoto(p.amina, new TextEncoder().encode("<html>".padEnd(200)))).rejects.toThrow("JPEG, PNG or WebP");
    await savePhoto(p.amina, jpeg);
    expect((await readPhoto(p.amina, u.brian))?.content_type).toBe("image/jpeg");
    await savePhoto(p.pending, jpeg);
    expect(await readPhoto(p.pending, u.brian)).toBeNull(); // unverified profile stays private
    expect(await readPhoto(p.pending, u.pending)).not.toBeNull(); // but visible to its owner
  });
});
