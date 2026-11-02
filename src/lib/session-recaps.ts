import "server-only";
import { database } from "@/lib/db";
import { profileImageSql } from "@/lib/profile-image-sql";
import { profileImage } from "@/lib/profile-image";
import { uuidPattern } from "@/lib/community-input";
import { discoverableUser } from "@/lib/social";
import { AUDIT_INSERT } from "@/lib/audit";
import { notify } from "@/lib/notifications";

export const RECAP_TOPIC_MAX = 120;
export const RECAP_TAKEAWAYS_MIN = 20;
export const RECAP_TAKEAWAYS_MAX = 1500;
export const RECAP_PAGE_SIZE = 10;

export class RecapInputError extends Error {}

type Person = { profile_id: string; name: string; headline: string | null; image: string | null };
export type Recap = {
  id: string; topic: string; takeaways: string; session_date: string; published_at: string;
  mentor: Person; mentee: Person; reactions: number; reacted: boolean; hidden: boolean;
};
export type RecapPartner = { mentorship_id: string; role: "mentor" | "mentee"; name: string; goal: string };
export type DraftRecap = { id: string; topic: string; takeaways: string; session_date: string; status: string; created_at: string; other_name: string; other_profile_id: string | null };

/** "YYYY-MM-DD" within the last five years and not in the future (Nairobi date). */
function sessionDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RecapInputError("Choose the date of the session.");
  const date = new Date(`${value}T00:00:00Z`);
  const today = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" }) + "T00:00:00Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new RecapInputError("Choose the date of the session.");
  if (date > today) throw new RecapInputError("The session date can't be in the future.");
  if (today.getTime() - date.getTime() > 5 * 365 * 86400000) throw new RecapInputError("The session date must be within the last five years.");
  return value;
}

export function parseRecap(data: FormData) {
  const text = (name: string) => {
    const raw = data.get(name);
    const value = typeof raw === "string" ? raw.normalize("NFC").trim() : "";
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new RecapInputError("Remove unsupported characters.");
    return value;
  };
  const mentorshipId = text("mentorship_id");
  if (!uuidPattern.test(mentorshipId)) throw new RecapInputError("Choose who the session was with.");
  const topic = text("topic");
  if (!topic) throw new RecapInputError("Add a topic for the session.");
  if (topic.length > RECAP_TOPIC_MAX) throw new RecapInputError(`The topic must be ${RECAP_TOPIC_MAX} characters or fewer.`);
  const takeaways = text("takeaways");
  if (takeaways.length < RECAP_TAKEAWAYS_MIN) throw new RecapInputError(`Share at least ${RECAP_TAKEAWAYS_MIN} characters about what you covered.`);
  if (takeaways.length > RECAP_TAKEAWAYS_MAX) throw new RecapInputError(`Takeaways must be ${RECAP_TAKEAWAYS_MAX} characters or fewer.`);
  return { mentorshipId, topic, takeaways, sessionDate: sessionDate(text("session_date")) };
}

/** Accepted mentorships the user can write a recap for, with the other person still a member. */
export async function recapPartners(userId: string) {
  return (await database().query<RecapPartner>(`SELECT r.id AS mentorship_id,
      CASE WHEN r.mentor_id = $1 THEN 'mentee' ELSE 'mentor' END AS role, p.full_name AS name, r.goal
    FROM mentorship_requests r
    JOIN users o ON o.id = CASE WHEN r.mentor_id = $1 THEN r.mentee_id ELSE r.mentor_id END
    JOIN profiles p ON p.user_id = o.id
    WHERE r.status = 'accepted' AND $1 IN (r.mentor_id, r.mentee_id) AND ${discoverableUser("o", "p")}
    ORDER BY r.responded_at DESC NULLS LAST LIMIT 50`, [userId])).rows;
}

export type RecapOutcome = "sent" | "duplicate" | "unavailable";

/** Drafts a recap for the other person in the mentorship to approve. */
export async function createRecap(userId: string, input: ReturnType<typeof parseRecap>): Promise<RecapOutcome> {
  const partner = (await database().query<{ partner_id: string }>(`SELECT CASE WHEN r.mentor_id = $2 THEN r.mentee_id ELSE r.mentor_id END AS partner_id
    FROM mentorship_requests r
    JOIN users o ON o.id = CASE WHEN r.mentor_id = $2 THEN r.mentee_id ELSE r.mentor_id END JOIN profiles p ON p.user_id = o.id
    WHERE r.id = $1 AND r.status = 'accepted' AND $2 IN (r.mentor_id, r.mentee_id) AND ${discoverableUser("o", "p")}`,
  [input.mentorshipId, userId])).rows[0];
  if (!partner) return "unavailable";
  const inserted = await database().query(`INSERT INTO session_recaps (mentorship_id, author_id, partner_id, topic, session_date, takeaways)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (mentorship_id) WHERE status = 'pending' DO NOTHING RETURNING id`,
  [input.mentorshipId, userId, partner.partner_id, input.topic, input.sessionDate, input.takeaways]);
  if (!inserted.rowCount) return "duplicate";
  await notify(database(), partner.partner_id, userId, "recap_to_approve", "/mentorship/requests#recaps");
  return "sent";
}

/** Only the other person in the session can approve or decline a recap. */
export async function decideRecap(userId: string, recapId: string, approve: boolean) {
  if (!uuidPattern.test(recapId)) return false;
  const decided = (await database().query<{ author_id: string }>(`UPDATE session_recaps SET status = $3, decided_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND partner_id = $2 AND status = 'pending' RETURNING author_id`, [recapId, userId, approve ? "published" : "declined"])).rows[0];
  if (decided && approve) await notify(database(), decided.author_id, userId, "recap_published", "/recaps");
  return Boolean(decided);
}

export async function withdrawRecap(userId: string, recapId: string) {
  if (!uuidPattern.test(recapId)) return false;
  return Boolean((await database().query(`UPDATE session_recaps SET status = 'withdrawn', decided_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND author_id = $2 AND status = 'pending'`, [recapId, userId])).rowCount);
}

/** Recaps waiting for this user's approval, and the user's own recent drafts. */
export async function recapDrafts(userId: string) {
  const query = (mine: "partner_id" | "author_id", other: "partner_id" | "author_id", statuses: string[]) => database().query<DraftRecap>(`
    SELECT s.id, s.topic, s.takeaways, s.session_date::text, s.status, s.created_at, p.full_name AS other_name, p.id AS other_profile_id
    FROM session_recaps s JOIN profiles p ON p.user_id = s.${other}
    WHERE s.${mine} = $1 AND s.status = ANY($2) AND s.created_at > CURRENT_TIMESTAMP - INTERVAL '90 days'
    ORDER BY s.created_at DESC LIMIT 20`, [userId, statuses]);
  const [toReview, mine] = await Promise.all([query("partner_id", "author_id", ["pending"]), query("author_id", "partner_id", ["pending", "declined"])]);
  return { toReview: toReview.rows, mine: mine.rows };
}

export async function pendingRecapCount(userId: string) {
  return (await database().query<{ n: number }>("SELECT count(*)::int AS n FROM session_recaps WHERE partner_id = $1 AND status = 'pending'", [userId])).rows[0].n;
}

const person = (alias: "mentor" | "mentee", u: string, p: string) =>
  `json_build_object('profile_id', ${p}.id, 'name', ${p}.full_name, 'headline', ${p}.headline, 'image', ${profileImageSql(p, u)}) AS ${alias}`;

function recapQuery(where: string, admin = false) {
  return `SELECT s.id, s.topic, s.takeaways, s.session_date::text, s.decided_at AS published_at, s.hidden_at IS NOT NULL AS hidden,
      ${person("mentor", "mu", "mp")}, ${person("mentee", "eu", "ep")},
      (SELECT count(*)::int FROM recap_reactions x WHERE x.recap_id = s.id) AS reactions,
      EXISTS (SELECT 1 FROM recap_reactions x WHERE x.recap_id = s.id AND x.user_id = $1) AS reacted
    FROM session_recaps s JOIN mentorship_requests r ON r.id = s.mentorship_id
    JOIN users mu ON mu.id = r.mentor_id JOIN profiles mp ON mp.user_id = mu.id
    JOIN users eu ON eu.id = r.mentee_id JOIN profiles ep ON ep.user_id = eu.id
    WHERE s.status = 'published' AND ${where} ${admin ? "" // Administrators see every published recap.
      : `AND s.hidden_at IS NULL AND ${discoverableUser("mu", "mp")} AND ${discoverableUser("eu", "ep")}`}`;
}

const clean = (rows: Recap[]) => rows.map(row => ({
  ...row,
  mentor: { ...row.mentor, image: profileImage(row.mentor.image) },
  mentee: { ...row.mentee, image: profileImage(row.mentee.image) },
}));

/** The community feed: newest published, visible recaps between current members. */
export async function recapFeed(viewerId: string, page = 1, size = RECAP_PAGE_SIZE) {
  const total = (await database().query<{ n: number }>(`SELECT count(*)::int AS n FROM (${recapQuery("TRUE")}) feed`, [viewerId])).rows[0].n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const rows = (await database().query<Recap>(`${recapQuery("TRUE")} ORDER BY s.decided_at DESC, s.id LIMIT $2 OFFSET $3`,
    [viewerId, size, (current - 1) * size])).rows;
  return { recaps: clean(rows), total, pages, page: current };
}

/** Published recaps involving the person who owns this profile. */
export async function recapsForProfile(viewerId: string, profileId: string, limit = 3) {
  if (!uuidPattern.test(profileId)) return [];
  return clean((await database().query<Recap>(`${recapQuery("$2 IN (mp.id, ep.id)")} ORDER BY s.decided_at DESC LIMIT $3`,
    [viewerId, profileId, limit])).rows);
}

/** Adds or removes the viewer's "Insightful" reaction on a visible recap. */
export async function toggleReaction(userId: string, recapId: string) {
  if (!uuidPattern.test(recapId)) return false;
  const visible = (await database().query(`SELECT 1 FROM (${recapQuery("s.id = $2")}) r`, [userId, recapId])).rowCount;
  if (!visible) return false;
  const removed = await database().query("DELETE FROM recap_reactions WHERE recap_id = $1 AND user_id = $2", [recapId, userId]);
  if (!removed.rowCount) await database().query("INSERT INTO recap_reactions (recap_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [recapId, userId]);
  return true;
}

/** Administration: every published recap, including hidden ones. */
export async function adminRecaps(adminId: string, page = 1, size = 20) {
  const total = (await database().query<{ n: number }>(`SELECT count(*)::int AS n FROM (${recapQuery("TRUE", true)}) all_recaps`, [adminId])).rows[0].n;
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), pages);
  const rows = (await database().query<Recap>(`${recapQuery("TRUE", true)} ORDER BY s.decided_at DESC, s.id LIMIT $2 OFFSET $3`,
    [adminId, size, (current - 1) * size])).rows;
  return { recaps: clean(rows), total, pages, page: current };
}

export async function setRecapHidden(adminId: string, recapId: string, hidden: boolean) {
  if (!uuidPattern.test(recapId)) return false;
  const change = hidden
    ? "UPDATE session_recaps SET hidden_at = CURRENT_TIMESTAMP, hidden_by = $2 WHERE id = $1 AND status = 'published' AND hidden_at IS NULL RETURNING id"
    : "UPDATE session_recaps SET hidden_at = NULL, hidden_by = NULL WHERE id = $1 AND status = 'published' AND hidden_at IS NOT NULL RETURNING id";
  return Boolean((await database().query(`WITH changed AS (${change}),
    logged AS (${AUDIT_INSERT} SELECT $2, $3, 'session_recap', id::text, '{}'::jsonb FROM changed)
    SELECT id FROM changed`, [recapId, adminId, hidden ? "recap.hide" : "recap.restore"])).rowCount);
}
