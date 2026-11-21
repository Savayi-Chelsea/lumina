import "server-only";
import { database } from "@/lib/db";

/** Community engagement for administrators: aggregates only, no individual is identifiable. */
export type MonthPoint = { month: string; value: number };
export type Engagement = {
  totals: { members: number; mentors: number; connections: number; mentorships: number; acceptance_rate: number | null;
    median_reply_hours: number | null; recaps: number; upcoming_sessions: number; event_places: number };
  series: { connections: MonthPoint[]; requests: MonthPoint[]; recaps: MonthPoint[]; sessions: MonthPoint[] };
  departments: { department: string; members: number; mentors: number; mentorships: number }[];
};

const members = `u.role = 'alumni' AND u.account_status = 'active' AND u.alumni_verified`;

/** Monthly counts for the last 12 months, with empty months filled in as zero. */
async function monthly(table: string, column: string, where = "TRUE") {
  return (await database().query<MonthPoint>(`
    WITH months AS (SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS month)
    SELECT to_char(m.month, 'YYYY-MM') AS month, count(t.*)::int AS value FROM months m
    LEFT JOIN ${table} t ON date_trunc('month', t.${column} AT TIME ZONE 'Africa/Nairobi') = m.month AND ${where}
    GROUP BY m.month ORDER BY m.month`)).rows;
}

export async function engagement(): Promise<Engagement> {
  const db = database();
  const [totals, connections, requests, recaps, sessions, departments] = await Promise.all([
    db.query(`SELECT
      (SELECT count(*)::int FROM users u WHERE ${members}) AS members,
      (SELECT count(*)::int FROM users u JOIN profiles p ON p.user_id = u.id JOIN mentorship_preferences m ON m.profile_id = p.id
        WHERE ${members} AND m.available_for_mentorship AND m.consent_to_matching) AS mentors,
      (SELECT count(*)::int FROM connections WHERE status = 'accepted') AS connections,
      (SELECT count(*)::int FROM mentorship_requests WHERE status = 'accepted') AS mentorships,
      (SELECT round(avg(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END)::numeric, 3)::float FROM mentorship_requests WHERE status IN ('accepted', 'declined')) AS acceptance_rate,
      (SELECT round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM responded_at - created_at) / 3600))::numeric, 1)::float
        FROM mentorship_requests WHERE responded_at IS NOT NULL AND status IN ('accepted', 'declined')) AS median_reply_hours,
      (SELECT count(*)::int FROM session_recaps WHERE status = 'published' AND hidden_at IS NULL) AS recaps,
      (SELECT count(*)::int FROM mentorship_sessions s JOIN mentor_availability a ON a.id = s.slot_id WHERE s.status = 'booked' AND a.starts_at > CURRENT_TIMESTAMP) AS upcoming_sessions,
      (SELECT count(*)::int FROM event_registrations) AS event_places`),
    monthly("connections", "responded_at", "t.status = 'accepted'"),
    monthly("mentorship_requests", "created_at"),
    monthly("session_recaps", "decided_at", "t.status = 'published'"),
    monthly("mentorship_sessions", "created_at"),
    db.query(`SELECT p.former_kq_department AS department, count(*)::int AS members,
        count(*) FILTER (WHERE m.available_for_mentorship AND m.consent_to_matching)::int AS mentors,
        (SELECT count(*)::int FROM mentorship_requests r JOIN profiles q ON q.user_id IN (r.mentor_id, r.mentee_id)
          WHERE r.status = 'accepted' AND q.former_kq_department = p.former_kq_department) AS mentorships
      FROM users u JOIN profiles p ON p.user_id = u.id LEFT JOIN mentorship_preferences m ON m.profile_id = p.id
      WHERE ${members} AND p.former_kq_department IS NOT NULL GROUP BY p.former_kq_department ORDER BY members DESC, department`),
  ]);
  return { totals: totals.rows[0], series: { connections, requests, recaps, sessions }, departments: departments.rows };
}
