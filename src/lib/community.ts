import "server-only";
import { database } from "@/lib/db";
import { uuidPattern, type EventInput, type OpportunityInput, type Publication } from "@/lib/community-input";

export type CommunityEvent = EventInput & {
  id: string; status: Publication; synthetic: boolean;
  registration_count: number; registered: boolean; updated_at: string;
};
export type Opportunity = OpportunityInput & { id: string; status: Publication; synthetic: boolean; created_at: string };
export type Attendee = { full_name: string | null; email: string; registered_at: string };

const eventFields = `e.id, e.title, e.summary, e.description, e.category, e.format, e.location,
  e.starts_at, e.ends_at, e.capacity, e.status, e.synthetic, e.updated_at,
  (SELECT count(*)::int FROM event_registrations r WHERE r.event_id = e.id) AS registration_count,
  EXISTS (SELECT 1 FROM event_registrations r WHERE r.event_id = e.id AND r.user_id = $1) AS registered`;
const opportunityFields = `o.id, o.title, o.organization, o.opportunity_type, o.work_mode, o.location, o.industry,
  o.summary, o.description, o.how_to_apply, o.closes_on::text AS closes_on, o.status, o.synthetic, o.created_at`;
// Open listings: published and not past their closing date in Nairobi.
const openOpportunity = `o.status = 'published' AND (o.closes_on IS NULL OR o.closes_on >= (now() AT TIME ZONE 'Africa/Nairobi')::date)`;

export async function listEvents(userId: string, filters: { view: "upcoming" | "past"; format: string | null }, limit = 60) {
  const values: unknown[] = [userId];
  const conditions = ["e.status = 'published'", filters.view === "past" ? "e.ends_at < now()" : "e.ends_at >= now()"];
  if (filters.format) { values.push(filters.format); conditions.push(`e.format = $${values.length}`); }
  values.push(limit);
  const order = filters.view === "past" ? "e.starts_at DESC" : "e.starts_at ASC";
  return (await database().query<CommunityEvent>(`SELECT ${eventFields} FROM events e WHERE ${conditions.join(" AND ")} ORDER BY ${order}, e.id LIMIT $${values.length}`, values)).rows;
}

/** Alumni see published events only; admins can preview drafts and archived events. */
export async function getEvent(id: string, userId: string, admin = false) {
  if (!uuidPattern.test(id)) return null;
  const visibility = admin ? "TRUE" : "e.status = 'published'";
  return (await database().query<CommunityEvent>(`SELECT ${eventFields} FROM events e WHERE e.id = $2 AND ${visibility}`, [userId, id])).rows[0] || null;
}

export type RegistrationOutcome = "registered" | "already" | "full" | "closed" | "cancelled" | "not_registered";

/** Serialised per event so capacity can never be exceeded by concurrent registrations. */
export async function registerForEvent(eventId: string, userId: string): Promise<RegistrationOutcome> {
  if (!uuidPattern.test(eventId)) return "closed";
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const event = (await conn.query<{ capacity: number | null; open: boolean }>(
      `SELECT capacity, (status = 'published' AND starts_at > now()) AS open FROM events WHERE id = $1 FOR UPDATE`, [eventId])).rows[0];
    let outcome: RegistrationOutcome;
    if (!event?.open) outcome = "closed";
    else if ((await conn.query("SELECT 1 FROM event_registrations WHERE event_id = $1 AND user_id = $2", [eventId, userId])).rowCount) outcome = "already";
    else {
      const taken = Number((await conn.query<{ n: number }>("SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1", [eventId])).rows[0].n);
      if (event.capacity !== null && taken >= event.capacity) outcome = "full";
      else { await conn.query("INSERT INTO event_registrations (event_id, user_id) VALUES ($1, $2)", [eventId, userId]); outcome = "registered"; }
    }
    await conn.query("COMMIT");
    return outcome;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function cancelRegistration(eventId: string, userId: string): Promise<RegistrationOutcome> {
  if (!uuidPattern.test(eventId)) return "closed";
  const result = await database().query(
    `DELETE FROM event_registrations r USING events e WHERE r.event_id = e.id AND r.event_id = $1 AND r.user_id = $2 AND e.starts_at > now()`, [eventId, userId]);
  return result.rowCount ? "cancelled" : "not_registered";
}

export async function listOpportunities(filters: { type: string | null; q: string }, limit = 60) {
  const values: unknown[] = [];
  const conditions = [openOpportunity];
  if (filters.type) { values.push(filters.type); conditions.push(`o.opportunity_type = $${values.length}`); }
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, value => `\\${value}`)}%`);
    const p = `$${values.length}`;
    conditions.push(`(o.title ILIKE ${p} OR o.organization ILIKE ${p} OR o.summary ILIKE ${p} OR o.industry ILIKE ${p} OR o.location ILIKE ${p})`);
  }
  values.push(limit);
  return (await database().query<Opportunity>(`SELECT ${opportunityFields} FROM opportunities o WHERE ${conditions.join(" AND ")} ORDER BY o.closes_on ASC NULLS LAST, o.created_at DESC, o.id LIMIT $${values.length}`, values)).rows;
}

export async function getOpportunity(id: string, admin = false) {
  if (!uuidPattern.test(id)) return null;
  const visibility = admin ? "TRUE" : openOpportunity;
  return (await database().query<Opportunity>(`SELECT ${opportunityFields} FROM opportunities o WHERE o.id = $1 AND ${visibility}`, [id])).rows[0] || null;
}

// ---------- Administration ----------

export async function adminEvents() {
  return (await database().query<CommunityEvent>(`SELECT ${eventFields} FROM events e ORDER BY (e.status = 'archived'), e.starts_at DESC`, [null])).rows;
}

export async function eventAttendees(eventId: string) {
  return (await database().query<Attendee>(`SELECT p.full_name, u.email, r.registered_at FROM event_registrations r
    JOIN users u ON u.id = r.user_id LEFT JOIN profiles p ON p.user_id = u.id WHERE r.event_id = $1 ORDER BY r.registered_at`, [eventId])).rows;
}

export async function saveEvent(input: EventInput, status: Publication, adminId: string, id?: string) {
  const values = [input.title, input.summary, input.description, input.category, input.format, input.location, input.starts_at, input.ends_at, input.capacity, status];
  if (id) {
    if (!uuidPattern.test(id)) return null;
    const result = await database().query<{ id: string }>(`UPDATE events SET title=$1, summary=$2, description=$3, category=$4, format=$5, location=$6,
      starts_at=$7, ends_at=$8, capacity=$9, status=$10, updated_at=CURRENT_TIMESTAMP WHERE id=$11 RETURNING id`, [...values, id]);
    return result.rows[0]?.id || null;
  }
  return (await database().query<{ id: string }>(`INSERT INTO events (title, summary, description, category, format, location, starts_at, ends_at, capacity, status, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`, [...values, adminId])).rows[0].id;
}

export async function adminOpportunities() {
  return (await database().query<Opportunity>(`SELECT ${opportunityFields} FROM opportunities o ORDER BY (o.status = 'archived'), o.created_at DESC`)).rows;
}

export async function saveOpportunity(input: OpportunityInput, status: Publication, adminId: string, id?: string) {
  const values = [input.title, input.organization, input.opportunity_type, input.work_mode, input.location, input.industry, input.summary, input.description, input.how_to_apply, input.closes_on, status];
  if (id) {
    if (!uuidPattern.test(id)) return null;
    const result = await database().query<{ id: string }>(`UPDATE opportunities SET title=$1, organization=$2, opportunity_type=$3, work_mode=$4, location=$5,
      industry=$6, summary=$7, description=$8, how_to_apply=$9, closes_on=$10, status=$11, updated_at=CURRENT_TIMESTAMP WHERE id=$12 RETURNING id`, [...values, id]);
    return result.rows[0]?.id || null;
  }
  return (await database().query<{ id: string }>(`INSERT INTO opportunities (title, organization, opportunity_type, work_mode, location, industry, summary, description, how_to_apply, closes_on, status, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`, [...values, adminId])).rows[0].id;
}

export async function setStatus(kind: "events" | "opportunities", id: string, status: Publication) {
  if (!uuidPattern.test(id)) return false;
  const table = kind === "events" ? "events" : "opportunities";
  return Boolean((await database().query(`UPDATE ${table} SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [id, status])).rowCount);
}

export async function communityCounts() {
  return (await database().query<{ upcoming_events: number; registrations: number; open_opportunities: number; drafts: number }>(`SELECT
    (SELECT count(*)::int FROM events WHERE status = 'published' AND ends_at >= now()) AS upcoming_events,
    (SELECT count(*)::int FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.ends_at >= now()) AS registrations,
    (SELECT count(*)::int FROM opportunities o WHERE ${openOpportunity}) AS open_opportunities,
    (SELECT count(*)::int FROM events WHERE status = 'draft') + (SELECT count(*)::int FROM opportunities WHERE status = 'draft') AS drafts`)).rows[0];
}
