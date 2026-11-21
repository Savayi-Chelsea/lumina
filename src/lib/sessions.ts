import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { uuidPattern } from "@/lib/community-input";
import { discoverableUser } from "@/lib/social";

/**
 * Mentoring session scheduling. Mentors publish time slots; the mentee of an
 * accepted mentorship books one. Times are entered and shown in Nairobi time
 * (UTC+3, no daylight saving) and stored in UTC.
 */
export const SESSION_MODES = { video: "Video call", phone: "Phone call", in_person: "In person" } as const;
export type SessionMode = keyof typeof SESSION_MODES;
export const DURATIONS = [30, 45, 60, 90] as const;
const MAX_OPEN_SLOTS = 60;

export class SessionInputError extends Error {}

const clean = (value: FormDataEntryValue | null) => typeof value === "string" ? value.normalize("NFC").trim() : "";
const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

export function parseSlot(data: FormData, now = new Date()) {
  const date = clean(data.get("date")), time = clean(data.get("time"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new SessionInputError("Choose a date and start time.");
  const start = new Date(`${date}T${time}:00+03:00`);
  // Round-trip through Nairobi time so impossible dates (30 February) are rejected, not rolled over.
  if (Number.isNaN(start.getTime()) || new Date(start.getTime() + 3 * 3600000).toISOString().slice(0, 16) !== `${date}T${time}`) throw new SessionInputError("Choose a valid date and time.");
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59 || minutes % 15) throw new SessionInputError("Start times are in 15-minute steps.");
  if (start.getTime() < now.getTime() + 60 * 60 * 1000) throw new SessionInputError("Slots must start at least an hour from now.");
  if (start.getTime() > now.getTime() + 90 * 86400000) throw new SessionInputError("Slots can be at most 90 days ahead.");
  const duration = Number(data.get("duration"));
  if (!(DURATIONS as readonly number[]).includes(duration)) throw new SessionInputError("Choose a length of 30, 45, 60 or 90 minutes.");
  const mode = clean(data.get("mode"));
  if (!(mode in SESSION_MODES)) throw new SessionInputError("Choose how you'll meet.");
  const details = clean(data.get("details"));
  if (details.length > 300 || controls.test(details)) throw new SessionInputError("Keep meeting details to 300 characters.");
  if (/^javascript:/i.test(details)) throw new SessionInputError("Enter a normal meeting link or place.");
  return { start, end: new Date(start.getTime() + duration * 60000), mode: mode as SessionMode, details: details || null };
}

export function parseAgenda(value: FormDataEntryValue | null) {
  const agenda = clean(value);
  if (agenda.length > 500 || controls.test(agenda)) throw new SessionInputError("Keep your agenda to 500 characters.");
  return agenda || null;
}

async function transaction<T>(work: (conn: PoolClient) => Promise<T>) {
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const result = await work(conn);
    await conn.query("COMMIT");
    return result;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

/** Mentors who offer mentorship (or already mentor someone) can publish non-overlapping slots. */
export async function addSlot(mentorId: string, slot: ReturnType<typeof parseSlot>) {
  return transaction(async conn => {
    await conn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`slots:${mentorId}`]);
    const allowed = (await conn.query(`SELECT 1 FROM profiles p JOIN mentorship_preferences m ON m.profile_id = p.id
      WHERE p.user_id = $1 AND m.available_for_mentorship
      UNION SELECT 1 FROM mentorship_requests WHERE mentor_id = $1 AND status = 'accepted'`, [mentorId])).rowCount;
    if (!allowed) return "not_mentor" as const;
    const overlap = (await conn.query(`SELECT 1 FROM mentor_availability WHERE mentor_id = $1 AND status IN ('open', 'booked')
      AND starts_at < $3 AND ends_at > $2`, [mentorId, slot.start, slot.end])).rowCount;
    if (overlap) return "overlap" as const;
    const open = (await conn.query<{ n: number }>("SELECT count(*)::int AS n FROM mentor_availability WHERE mentor_id = $1 AND status = 'open' AND starts_at > CURRENT_TIMESTAMP", [mentorId])).rows[0].n;
    if (open >= MAX_OPEN_SLOTS) return "too_many" as const;
    await conn.query("INSERT INTO mentor_availability (mentor_id, starts_at, ends_at, mode, details) VALUES ($1, $2, $3, $4, $5)",
      [mentorId, slot.start, slot.end, slot.mode, slot.details]);
    return "added" as const;
  });
}

export type Slot = { id: string; starts_at: string; ends_at: string; mode: SessionMode; details: string | null; status: string;
  session_id: string | null; mentee_name: string | null; mentee_profile_id: string | null; agenda: string | null };

export async function mySlots(mentorId: string) {
  return (await database().query<Slot>(`SELECT a.id, a.starts_at, a.ends_at, a.mode, a.details, a.status,
      s.id AS session_id, p.full_name AS mentee_name, p.id AS mentee_profile_id, s.agenda
    FROM mentor_availability a
    LEFT JOIN mentorship_sessions s ON s.slot_id = a.id AND s.status = 'booked'
    LEFT JOIN mentorship_requests r ON r.id = s.mentorship_id LEFT JOIN profiles p ON p.user_id = r.mentee_id
    WHERE a.mentor_id = $1 AND a.ends_at > CURRENT_TIMESTAMP AND a.status <> 'cancelled'
    ORDER BY a.starts_at LIMIT 100`, [mentorId])).rows;
}

/** The mentor's open slots, offered only to the mentee of an accepted mentorship. */
export async function bookableSlots(menteeId: string, mentorshipId: string) {
  if (!uuidPattern.test(mentorshipId)) return null;
  const mentorship = (await database().query<{ mentor_id: string; mentor_name: string; mentor_profile_id: string; goal: string }>(`
    SELECT r.mentor_id, p.full_name AS mentor_name, p.id AS mentor_profile_id, r.goal FROM mentorship_requests r
    JOIN users u ON u.id = r.mentor_id JOIN profiles p ON p.user_id = u.id
    WHERE r.id = $1 AND r.mentee_id = $2 AND r.status = 'accepted' AND ${discoverableUser("u", "p")}`, [mentorshipId, menteeId])).rows[0];
  if (!mentorship) return null;
  const slots = (await database().query<Pick<Slot, "id" | "starts_at" | "ends_at" | "mode">>(`SELECT id, starts_at, ends_at, mode FROM mentor_availability
    WHERE mentor_id = $1 AND status = 'open' AND starts_at > CURRENT_TIMESTAMP + INTERVAL '1 hour' ORDER BY starts_at LIMIT 60`, [mentorship.mentor_id])).rows;
  return { ...mentorship, slots };
}

export type BookOutcome = { outcome: "booked"; sessionId: string } | { outcome: "taken" | "unavailable" };

export async function bookSlot(menteeId: string, mentorshipId: string, slotId: string, agenda: string | null): Promise<BookOutcome> {
  if (!uuidPattern.test(mentorshipId) || !uuidPattern.test(slotId)) return { outcome: "unavailable" };
  return transaction(async conn => {
    const mentorship = (await conn.query<{ mentor_id: string }>(`SELECT r.mentor_id FROM mentorship_requests r
      JOIN users u ON u.id = r.mentor_id JOIN profiles p ON p.user_id = u.id
      WHERE r.id = $1 AND r.mentee_id = $2 AND r.status = 'accepted' AND ${discoverableUser("u", "p")}`, [mentorshipId, menteeId])).rows[0];
    if (!mentorship) return { outcome: "unavailable" as const };
    // Row lock: two mentees racing for one slot cannot both book it.
    const slot = (await conn.query("SELECT id FROM mentor_availability WHERE id = $1 AND mentor_id = $2 AND status = 'open' AND starts_at > CURRENT_TIMESTAMP FOR UPDATE",
      [slotId, mentorship.mentor_id])).rows[0];
    if (!slot) return { outcome: "taken" as const };
    await conn.query("UPDATE mentor_availability SET status = 'booked' WHERE id = $1", [slotId]);
    const sessionId = (await conn.query<{ id: string }>("INSERT INTO mentorship_sessions (slot_id, mentorship_id, agenda) VALUES ($1, $2, $3) RETURNING id",
      [slotId, mentorshipId, agenda])).rows[0].id;
    await notify(conn, mentorship.mentor_id, menteeId, "session_booked", "/mentorship/sessions");
    return { outcome: "booked" as const, sessionId };
  });
}

/** Either person can cancel before it starts. A mentee's cancellation reopens the slot; a mentor's withdraws it. */
export async function cancelSession(userId: string, sessionId: string) {
  if (!uuidPattern.test(sessionId)) return null;
  return transaction(async conn => {
    const row = (await conn.query<{ slot_id: string; mentor_id: string; mentee_id: string }>(`SELECT s.slot_id, r.mentor_id, r.mentee_id
      FROM mentorship_sessions s JOIN mentorship_requests r ON r.id = s.mentorship_id JOIN mentor_availability a ON a.id = s.slot_id
      WHERE s.id = $1 AND s.status = 'booked' AND a.starts_at > CURRENT_TIMESTAMP AND $2 IN (r.mentor_id, r.mentee_id) FOR UPDATE OF s, a`, [sessionId, userId])).rows[0];
    if (!row) return null;
    const byMentor = row.mentor_id === userId;
    await conn.query("UPDATE mentorship_sessions SET status = 'cancelled', cancelled_by = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [sessionId, userId]);
    await conn.query("UPDATE mentor_availability SET status = $2 WHERE id = $1", [row.slot_id, byMentor ? "cancelled" : "open"]);
    await notify(conn, byMentor ? row.mentee_id : row.mentor_id, userId, "session_cancelled", "/mentorship/sessions");
    return { otherId: byMentor ? row.mentee_id : row.mentor_id };
  });
}

/** Mentors can withdraw an open slot; a booked slot is cancelled through its session. */
export async function removeSlot(mentorId: string, slotId: string) {
  if (!uuidPattern.test(slotId)) return false;
  return Boolean((await database().query("UPDATE mentor_availability SET status = 'cancelled' WHERE id = $1 AND mentor_id = $2 AND status = 'open'", [slotId, mentorId])).rowCount);
}

export type SessionRow = {
  id: string; mentorship_id: string; role: "mentor" | "mentee"; status: "booked" | "cancelled"; starts_at: string; ends_at: string;
  mode: SessionMode; details: string | null; agenda: string | null; other_name: string; other_profile_id: string; goal: string;
  cancelled_by_me: boolean | null;
};

export async function mySessions(userId: string) {
  const rows = (await database().query<SessionRow>(`SELECT s.id, s.mentorship_id, CASE WHEN r.mentor_id = $1 THEN 'mentor' ELSE 'mentee' END AS role,
      s.status, a.starts_at, a.ends_at, a.mode, CASE WHEN s.status = 'booked' THEN a.details END AS details, s.agenda,
      p.full_name AS other_name, p.id AS other_profile_id, r.goal, s.cancelled_by = $1 AS cancelled_by_me
    FROM mentorship_sessions s JOIN mentor_availability a ON a.id = s.slot_id JOIN mentorship_requests r ON r.id = s.mentorship_id
    JOIN profiles p ON p.user_id = CASE WHEN r.mentor_id = $1 THEN r.mentee_id ELSE r.mentor_id END
    WHERE $1 IN (r.mentor_id, r.mentee_id) ORDER BY a.starts_at DESC LIMIT 100`, [userId])).rows;
  const now = Date.now();
  return {
    upcoming: rows.filter(row => row.status === "booked" && new Date(row.ends_at).getTime() > now).reverse(),
    past: rows.filter(row => row.status === "booked" && new Date(row.ends_at).getTime() <= now),
    cancelled: rows.filter(row => row.status === "cancelled").slice(0, 10),
  };
}

/** Details needed for a calendar file or email; only for the two participants. */
export async function sessionForCalendar(userId: string | null, sessionId: string) {
  if (!uuidPattern.test(sessionId)) return null;
  return (await database().query<{ id: string; status: string; starts_at: Date; ends_at: Date; mode: SessionMode; details: string | null; agenda: string | null;
    goal: string; mentor_id: string; mentee_id: string; mentor_name: string; mentee_name: string; mentor_email: string; mentee_email: string }>(`
    SELECT s.id, s.status, a.starts_at, a.ends_at, a.mode, a.details, s.agenda, r.goal, r.mentor_id, r.mentee_id,
      mp.full_name AS mentor_name, ep.full_name AS mentee_name, mu.email AS mentor_email, eu.email AS mentee_email
    FROM mentorship_sessions s JOIN mentor_availability a ON a.id = s.slot_id JOIN mentorship_requests r ON r.id = s.mentorship_id
    JOIN users mu ON mu.id = r.mentor_id JOIN profiles mp ON mp.user_id = mu.id
    JOIN users eu ON eu.id = r.mentee_id JOIN profiles ep ON ep.user_id = eu.id
    WHERE s.id = $1 AND ($2::uuid IS NULL OR $2 IN (r.mentor_id, r.mentee_id))`, [sessionId, userId])).rows[0] || null;
}

const nairobi = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
const nairobiTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });
export const sessionWhen = (start: string | Date, end: string | Date) => `${nairobi.format(new Date(start))}–${nairobiTime.format(new Date(end))} (Nairobi time)`;

/** Calendar date in Nairobi, `offsetDays` from now, as YYYY-MM-DD (for date inputs). */
export function nairobiDay(offsetDays = 0, now = new Date()) {
  return new Date(now.getTime() + 3 * 3600000 + offsetDays * 86400000).toISOString().slice(0, 10);
}
