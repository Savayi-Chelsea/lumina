import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { uuidPattern } from "@/lib/community-input";

/**
 * Measures match quality from real use: which mentors a member was shown and at
 * what rank, which result they asked to mentor them, and how the mentee rated
 * the match afterwards. The text a member searched for is never stored.
 */
export type SearchSource = "search" | "recommendation";
/** Search logs are deleted after 180 days by scripts/run_notifications.py. */

/** Records what was shown; returns the event id, or null if logging failed (search still works). */
export async function logSearch(userId: string, source: SearchSource, results: { profileId: string; score: number }[]) {
  const conn = await Promise.resolve().then(() => database().connect()).catch(() => null);
  if (!conn) return null;
  try {
    await conn.query("BEGIN");
    const id = (await conn.query<{ id: string }>("INSERT INTO mentor_search_events (searcher_id, source, result_count) VALUES ($1, $2, $3) RETURNING id",
      [userId, source, results.length])).rows[0].id;
    for (const [index, result] of results.entries()) {
      await conn.query("INSERT INTO mentor_search_results (event_id, rank, mentor_profile_id, score) VALUES ($1, $2, $3, $4)",
        [id, index + 1, result.profileId, Math.max(-1, Math.min(1, result.score))]);
    }
    await conn.query("COMMIT");
    return id;
  } catch {
    await conn.query("ROLLBACK").catch(() => {});
    return null;
  } finally {
    conn.release();
  }
}

/** Parses "?search=<uuid>&rank=<n>" carried from a result card to the request form. */
export function parseOrigin(search: unknown, rank: unknown) {
  if (typeof search !== "string" || !uuidPattern.test(search) || typeof rank !== "string" || !/^\d{1,2}$/.test(rank)) return null;
  const value = Number(rank);
  return value >= 1 && value <= 50 ? { eventId: search, rank: value } : null;
}

/** Links a new request to the search that produced it, only if that search was the mentee's and showed this mentor at that rank. */
export async function recordOrigin(db: Pick<PoolClient, "query">, requestId: string, menteeId: string, mentorProfileId: string, origin: { eventId: string; rank: number } | null) {
  if (!origin) return false;
  return Boolean((await db.query(`INSERT INTO mentorship_request_origins (request_id, event_id, rank)
    SELECT $1, e.id, r.rank FROM mentor_search_events e JOIN mentor_search_results r ON r.event_id = e.id
    WHERE e.id = $2 AND e.searcher_id = $3 AND r.rank = $4 AND r.mentor_profile_id = $5
    ON CONFLICT (request_id) DO NOTHING`, [requestId, origin.eventId, menteeId, origin.rank, mentorProfileId])).rowCount);
}

export class FeedbackInputError extends Error {}

export function parseFeedback(data: FormData) {
  const rating = Number(data.get("match_rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new FeedbackInputError("Choose a rating from 1 to 5.");
  const recommend = data.get("would_recommend");
  if (recommend !== "yes" && recommend !== "no") throw new FeedbackInputError("Say whether you would recommend this mentor.");
  const raw = data.get("comment");
  const comment = typeof raw === "string" ? raw.normalize("NFC").trim() : "";
  if (comment.length > 500) throw new FeedbackInputError("Keep your comment to 500 characters or fewer.");
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(comment)) throw new FeedbackInputError("Remove unsupported characters.");
  return { rating, recommend: recommend === "yes", comment: comment || null };
}

/** Only the mentee of an accepted mentorship can rate it; rating again updates the earlier answer. */
export async function saveFeedback(menteeId: string, mentorshipId: string, input: ReturnType<typeof parseFeedback>) {
  if (!uuidPattern.test(mentorshipId)) return false;
  return Boolean((await database().query(`INSERT INTO mentorship_feedback (mentorship_id, rater_id, match_rating, would_recommend, comment)
    SELECT r.id, $2, $3, $4, $5 FROM mentorship_requests r WHERE r.id = $1 AND r.mentee_id = $2 AND r.status = 'accepted'
    ON CONFLICT (mentorship_id, rater_id) DO UPDATE SET match_rating = EXCLUDED.match_rating, would_recommend = EXCLUDED.would_recommend,
      comment = EXCLUDED.comment, updated_at = CURRENT_TIMESTAMP`, [mentorshipId, menteeId, input.rating, input.recommend, input.comment])).rowCount);
}

export async function myFeedback(menteeId: string) {
  const rows = (await database().query<{ mentorship_id: string; match_rating: number; would_recommend: boolean }>(
    "SELECT mentorship_id, match_rating, would_recommend FROM mentorship_feedback WHERE rater_id = $1", [menteeId])).rows;
  return new Map(rows.map(row => [row.mentorship_id, row]));
}

export type RankRow = { rank: number; shown: number; requested: number; accepted: number; rated: number; average_rating: number | null };
export type MatchQuality = {
  window_days: number;
  searches: { source: SearchSource; events: number; members: number; with_results: number }[];
  ranks: RankRow[];
  requests: { total: number; from_search: number; from_recommendation: number; accepted: number; median_reply_hours: number | null };
  feedback: { count: number; average_rating: number | null; recommend_rate: number | null; by_source: { source: string; count: number; average_rating: number | null }[] };
};

/** Live match-quality metrics for administrators (aggregates only; no individual is shown). */
export async function matchQuality(days = 90): Promise<MatchQuality> {
  const db = database();
  const [searches, ranks, requests, feedback, bySource] = await Promise.all([
    db.query(`SELECT source, count(*)::int AS events, count(DISTINCT searcher_id)::int AS members, count(*) FILTER (WHERE result_count > 0)::int AS with_results
      FROM mentor_search_events WHERE created_at > CURRENT_TIMESTAMP - make_interval(days => $1) GROUP BY source ORDER BY source`, [days]),
    db.query(`SELECT r.rank::int, count(*)::int AS shown, count(o.request_id)::int AS requested,
        count(o.request_id) FILTER (WHERE m.status = 'accepted')::int AS accepted, count(f.match_rating)::int AS rated,
        round(avg(f.match_rating)::numeric, 2)::float AS average_rating
      FROM mentor_search_results r JOIN mentor_search_events e ON e.id = r.event_id
      LEFT JOIN mentorship_request_origins o ON o.event_id = r.event_id AND o.rank = r.rank
      LEFT JOIN mentorship_requests m ON m.id = o.request_id
      LEFT JOIN mentorship_feedback f ON f.mentorship_id = m.id AND f.rater_id = m.mentee_id
      WHERE e.source = 'search' AND e.created_at > CURRENT_TIMESTAMP - make_interval(days => $1) AND r.rank <= 10 GROUP BY r.rank ORDER BY r.rank`, [days]),
    db.query(`SELECT count(*)::int AS total,
        count(o.request_id) FILTER (WHERE e.source = 'search')::int AS from_search,
        count(o.request_id) FILTER (WHERE e.source = 'recommendation')::int AS from_recommendation,
        count(*) FILTER (WHERE m.status = 'accepted')::int AS accepted,
        round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM m.responded_at - m.created_at) / 3600)
          FILTER (WHERE m.responded_at IS NOT NULL))::numeric, 1)::float AS median_reply_hours
      FROM mentorship_requests m LEFT JOIN mentorship_request_origins o ON o.request_id = m.id
      LEFT JOIN mentor_search_events e ON e.id = o.event_id
      WHERE m.created_at > CURRENT_TIMESTAMP - make_interval(days => $1)`, [days]),
    db.query(`SELECT count(*)::int AS count, round(avg(match_rating)::numeric, 2)::float AS average_rating,
        round(avg(CASE WHEN would_recommend THEN 1 ELSE 0 END)::numeric, 3)::float AS recommend_rate
      FROM mentorship_feedback WHERE created_at > CURRENT_TIMESTAMP - make_interval(days => $1)`, [days]),
    db.query(`SELECT COALESCE(e.source, 'direct') AS source, count(*)::int AS count, round(avg(f.match_rating)::numeric, 2)::float AS average_rating
      FROM mentorship_feedback f LEFT JOIN mentorship_request_origins o ON o.request_id = f.mentorship_id
      LEFT JOIN mentor_search_events e ON e.id = o.event_id
      WHERE f.created_at > CURRENT_TIMESTAMP - make_interval(days => $1) GROUP BY 1 ORDER BY 1`, [days]),
  ]);
  return {
    window_days: days, searches: searches.rows, ranks: ranks.rows,
    requests: requests.rows[0], feedback: { ...feedback.rows[0], by_source: bySource.rows },
  };
}
