import "server-only";
import { database } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { conversationFor, insertMessage } from "@/lib/messages";
import { profileImageSql } from "@/lib/profile-image-sql";
import { profileImage } from "@/lib/profile-image";
import { uuidPattern } from "@/lib/community-input";
import { discoverableUser } from "@/lib/social";

export type MentorshipRequest = {
  id: string; goal: string; message: string; status: "pending" | "accepted" | "declined" | "withdrawn";
  created_at: string; responded_at: string | null;
  other_user_id: string; other_profile_id: string | null; other_name: string | null; other_headline: string | null; other_image: string | null;
};

export class MentorshipRequestError extends Error {}

export function parseMentorshipRequest(data: FormData) {
  const text = (name: string, label: string, max: number) => {
    const raw = data.get(name);
    const value = typeof raw === "string" ? raw.normalize("NFC").trim() : "";
    if (!value) throw new MentorshipRequestError(`${label} is required.`);
    if (value.length > max) throw new MentorshipRequestError(`${label} must be ${max} characters or fewer.`);
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new MentorshipRequestError(`${label} contains unsupported characters.`);
    return value;
  };
  return { goal: text("goal", "Your goal", 200), message: text("message", "Your message", 1000) };
}

export type RequestOutcome = "sent" | "duplicate" | "unavailable";

/** Only mentors who currently consent and are available can be asked. */
export async function requestMentorship(menteeId: string, mentorProfileId: string, input: { goal: string; message: string }): Promise<RequestOutcome> {
  if (!uuidPattern.test(mentorProfileId)) return "unavailable";
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const mentor = (await conn.query<{ user_id: string }>(`SELECT u.id AS user_id FROM profiles p JOIN users u ON u.id = p.user_id
      JOIN mentorship_preferences m ON m.profile_id = p.id
      WHERE p.id = $1 AND ${discoverableUser("u", "p")} AND m.consent_to_matching AND m.available_for_mentorship`, [mentorProfileId])).rows[0];
    if (!mentor || mentor.user_id === menteeId) { await conn.query("ROLLBACK"); return "unavailable"; }
    const inserted = await conn.query(`INSERT INTO mentorship_requests (mentee_id, mentor_id, goal, message) VALUES ($1, $2, $3, $4)
      ON CONFLICT (mentee_id, mentor_id) WHERE status = 'pending' DO NOTHING RETURNING id`, [menteeId, mentor.user_id, input.goal, input.message]);
    if (!inserted.rowCount) { await conn.query("ROLLBACK"); return "duplicate"; }
    await notify(conn, mentor.user_id, menteeId, "mentorship_request", "/mentorship/requests");
    await conn.query("COMMIT");
    return "sent";
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

/**
 * The mentor accepts or declines. Accepting opens a conversation that starts with
 * the mentee's original message, so the two can continue in Messages.
 */
export async function respondToMentorship(mentorId: string, requestId: string, accept: boolean) {
  if (!uuidPattern.test(requestId)) return null;
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const row = (await conn.query<{ mentee_id: string; goal: string; message: string }>(`UPDATE mentorship_requests SET status = $3, responded_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND mentor_id = $2 AND status = 'pending' RETURNING mentee_id, goal, message`, [requestId, mentorId, accept ? "accepted" : "declined"])).rows[0];
    let conversationId: string | null = null;
    if (row && accept) {
      conversationId = await conversationFor(conn, mentorId, row.mentee_id);
      await insertMessage(conn, conversationId, row.mentee_id, mentorId, `Mentorship request: ${row.goal}\n\n${row.message}`);
      await conn.query("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND actor_id = $2 AND kind = 'message' AND read_at IS NULL", [mentorId, row.mentee_id]);
      await notify(conn, row.mentee_id, mentorId, "mentorship_accepted", `/messages/${conversationId}`);
    } else if (row) {
      await notify(conn, row.mentee_id, mentorId, "mentorship_declined", "/mentorship/requests");
    }
    await conn.query("COMMIT");
    return row ? { status: accept ? "accepted" as const : "declined" as const, conversationId } : null;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function withdrawMentorship(menteeId: string, requestId: string) {
  if (!uuidPattern.test(requestId)) return false;
  return Boolean((await database().query(`UPDATE mentorship_requests SET status = 'withdrawn', responded_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND mentee_id = $2 AND status = 'pending'`, [requestId, menteeId])).rowCount);
}

export async function mentorshipRequests(userId: string) {
  const query = (mine: "mentor_id" | "mentee_id", other: "mentor_id" | "mentee_id") => database().query<MentorshipRequest>(`SELECT r.id, r.goal, r.message, r.status, r.created_at, r.responded_at,
      o.id AS other_user_id, p.id AS other_profile_id, p.full_name AS other_name, p.headline AS other_headline, ${profileImageSql("p", "o")} AS other_image
    FROM mentorship_requests r JOIN users o ON o.id = r.${other} LEFT JOIN profiles p ON p.user_id = o.id
    WHERE r.${mine} = $1 ORDER BY (r.status = 'pending') DESC, r.created_at DESC LIMIT 100`, [userId]);
  const [incoming, outgoing] = await Promise.all([query("mentor_id", "mentee_id"), query("mentee_id", "mentor_id")]);
  const clean = (rows: MentorshipRequest[]) => rows.map(row => ({ ...row, other_image: profileImage(row.other_image) }));
  return { incoming: clean(incoming.rows), outgoing: clean(outgoing.rows) };
}

/** The viewer's relationship with a mentor, for the profile action button. */
export async function mentorshipWith(menteeId: string, mentorUserId: string) {
  return (await database().query<{ id: string; status: string }>(`SELECT id, status FROM mentorship_requests
    WHERE mentee_id = $1 AND mentor_id = $2 AND status IN ('pending', 'accepted') ORDER BY created_at DESC LIMIT 1`, [menteeId, mentorUserId])).rows[0] || null;
}
