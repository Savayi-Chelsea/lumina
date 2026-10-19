import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";
import { adminEvents, cancelRegistration, eventAttendees, getEvent, getOpportunity, listEvents, listOpportunities, registerForEvent, saveEvent, saveOpportunity, setStatus } from "@/lib/community";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined, pool: undefined as import("pg").Pool | undefined }));
// Normally every query runs on one session that owns the temporary tables; the
// concurrency test swaps in a real multi-connection pool against public tables.
vi.mock("@/lib/db", () => ({
  database: () => shared.pool || ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

const hour = 60 * 60 * 1000;
const at = (hours: number) => new Date(Date.now() + hours * hour).toISOString();
const eventInput = (overrides: Record<string, unknown> = {}) => ({ title: "Reunion", summary: "Catch up", description: "Details", category: "Reunion" as const, format: "in_person" as const, location: "Nairobi", starts_at: at(48), ends_at: at(51), capacity: null as number | null, ...overrides });
const opportunityInput = (overrides: Record<string, unknown> = {}) => ({ title: "Cloud engineer", organization: "Kijani 100% Cloud", opportunity_type: "Job" as const, work_mode: "remote" as const, location: "Remote", industry: "Technology", summary: "Support role", description: "Details", how_to_apply: "Send CV", closes_on: null as string | null, ...overrides });

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("events and opportunities on live PostgreSQL temporary tables", () => {
  let pool: Pool;
  let before: string;
  let admin: string;
  let alumni: string[];
  const snapshot = async () => JSON.stringify((await shared.conn!.query(`SELECT
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.events t) AS events,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.event_id, t.user_id) FROM public.event_registrations t) AS registrations,
    (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id) FROM public.opportunities t) AS opportunities,
    (SELECT count(*) FROM public.users) AS users`)).rows);

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
    for (const table of ["users", "profiles", "events", "event_registrations", "opportunities"]) await shared.conn.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL)`);
  });

  beforeEach(async () => {
    await shared.conn!.query("DELETE FROM pg_temp.event_registrations; DELETE FROM pg_temp.events; DELETE FROM pg_temp.opportunities; DELETE FROM pg_temp.profiles; DELETE FROM pg_temp.users");
    admin = (await shared.conn!.query("INSERT INTO pg_temp.users(email, role, account_status, alumni_verified) VALUES ('admin@example.test','admin','active',TRUE) RETURNING id")).rows[0].id;
    alumni = (await shared.conn!.query("INSERT INTO pg_temp.users(email, account_status, alumni_verified) SELECT 'alum' || n || '@example.test', 'active', TRUE FROM generate_series(1,4) n RETURNING id")).rows.map(row => row.id);
    await shared.conn!.query("INSERT INTO pg_temp.profiles(user_id, full_name) VALUES ($1, 'Amina Otieno')", [alumni[0]]);
  });

  afterAll(async () => {
    if (shared.conn) { try { expect(await snapshot()).toBe(before); } finally { shared.conn.release(); shared.conn = undefined; } }
    if (pool) await pool.end();
  });

  it("shows only published events to alumni, split into upcoming and past", async () => {
    const upcoming = await saveEvent(eventInput(), "published", admin);
    await saveEvent(eventInput({ title: "Draft" }), "draft", admin);
    await saveEvent(eventInput({ title: "Archived" }), "archived", admin);
    const past = await saveEvent(eventInput({ title: "Past", starts_at: at(-50), ends_at: at(-48) }), "published", admin);
    expect((await listEvents(alumni[0], { view: "upcoming", format: null })).map(event => event.id)).toEqual([upcoming]);
    expect((await listEvents(alumni[0], { view: "past", format: null })).map(event => event.id)).toEqual([past]);
    expect(await listEvents(alumni[0], { view: "upcoming", format: "online" })).toEqual([]);
    const draft = (await adminEvents()).find(event => event.title === "Draft")!;
    expect(await getEvent(draft.id, alumni[0])).toBeNull();
    expect((await getEvent(draft.id, admin, true))?.status).toBe("draft");
    expect(await getEvent("not-a-uuid", alumni[0])).toBeNull();
  });

  it("registers, enforces capacity, reports attendance and cancels", async () => {
    const id = (await saveEvent(eventInput({ capacity: 2 }), "published", admin))!;
    expect(await registerForEvent(id, alumni[0])).toBe("registered");
    expect(await registerForEvent(id, alumni[0])).toBe("already");
    expect(await registerForEvent(id, alumni[1])).toBe("registered");
    expect(await registerForEvent(id, alumni[2])).toBe("full");
    const seen = await getEvent(id, alumni[0]);
    expect(seen).toMatchObject({ registration_count: 2, registered: true });
    expect((await getEvent(id, alumni[2]))?.registered).toBe(false);
    expect((await eventAttendees(id)).map(person => person.full_name)).toEqual(["Amina Otieno", null]);
    expect(await cancelRegistration(id, alumni[0])).toBe("cancelled");
    expect(await cancelRegistration(id, alumni[0])).toBe("not_registered");
    expect(await registerForEvent(id, alumni[2])).toBe("registered");
  });

  it("refuses registration for drafts, archived and started events", async () => {
    const draft = (await saveEvent(eventInput(), "draft", admin))!;
    const started = (await saveEvent(eventInput({ starts_at: at(-1), ends_at: at(2) }), "published", admin))!;
    expect(await registerForEvent(draft, alumni[0])).toBe("closed");
    expect(await registerForEvent(started, alumni[0])).toBe("closed");
    expect(await registerForEvent("00000000-0000-4000-8000-000000000000", alumni[0])).toBe("closed");
    expect(await setStatus("events", draft, "archived")).toBe(true);
    expect(await registerForEvent(draft, alumni[0])).toBe("closed");
  });

  it("never exceeds capacity under truly concurrent registrations", async () => {
    const concurrent = new Pool(pool.options);
    let eventId: string | undefined;
    try {
      // Borrow existing synthetic users read-only, so parallel test files that
      // snapshot public.users never observe a transient row.
      const users: string[] = (await concurrent.query("SELECT id FROM public.users WHERE email LIKE 'alum-%@synthetic.lumina.local' ORDER BY email LIMIT 6")).rows.map(row => row.id);
      expect(users).toHaveLength(6);
      eventId = (await concurrent.query(`INSERT INTO public.events (title, summary, description, category, format, location, starts_at, ends_at, capacity, status)
        VALUES ('Capacity test', 's', 'd', 'Reunion', 'online', 'Online', now() + interval '2 days', now() + interval '3 days', 2, 'published') RETURNING id`)).rows[0].id;
      shared.pool = concurrent;
      const results = await Promise.all(users.map(user => registerForEvent(eventId!, user)));
      expect(results.filter(result => result === "registered")).toHaveLength(2);
      expect(results.filter(result => result === "full")).toHaveLength(4);
      expect(Number((await concurrent.query("SELECT count(*) FROM public.event_registrations WHERE event_id = $1", [eventId])).rows[0].count)).toBe(2);
    } finally {
      shared.pool = undefined;
      // Registrations cascade with the disposable event.
      if (eventId) await concurrent.query("DELETE FROM public.events WHERE id = $1 AND title = 'Capacity test'", [eventId]);
      await concurrent.end();
    }
  });

  it("lists open opportunities only and searches safely", async () => {
    const open = (await saveOpportunity(opportunityInput(), "published", admin))!;
    await saveOpportunity(opportunityInput({ title: "Closed role", closes_on: "2000-01-01" }), "published", admin);
    await saveOpportunity(opportunityInput({ title: "Draft role" }), "draft", admin);
    await saveOpportunity(opportunityInput({ title: "Advisor", opportunity_type: "Advisory", organization: "Horizon" }), "published", admin);
    expect((await listOpportunities({ type: null, q: "" })).map(item => item.title).sort()).toEqual(["Advisor", "Cloud engineer"]);
    expect((await listOpportunities({ type: "Advisory", q: "" })).map(item => item.title)).toEqual(["Advisor"]);
    expect((await listOpportunities({ type: null, q: "100%" })).map(item => item.id)).toEqual([open]);
    expect(await listOpportunities({ type: null, q: "_" })).toEqual([]);
    const closed = (await saveOpportunity(opportunityInput({ title: "Closed again", closes_on: "2000-01-01" }), "published", admin))!;
    expect(await getOpportunity(closed)).toBeNull();
    expect((await getOpportunity(closed, true))?.title).toBe("Closed again");
  });

  it("updates listings in place and changes publication state", async () => {
    const id = (await saveEvent(eventInput(), "draft", admin))!;
    expect(await saveEvent(eventInput({ title: "Renamed" }), "published", admin, id)).toBe(id);
    expect((await getEvent(id, alumni[0]))?.title).toBe("Renamed");
    expect(await setStatus("events", id, "archived")).toBe(true);
    expect(await getEvent(id, alumni[0])).toBeNull();
    expect(await saveEvent(eventInput(), "draft", admin, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await setStatus("opportunities", "nope", "published")).toBe(false);
  });
});
