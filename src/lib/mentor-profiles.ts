import "server-only";
import { database } from "@/lib/db";
import { profileIdPattern } from "@/lib/mentorship-contract";

export type DiscoverableMentor = {
  id: string;
  full_name: string;
  headline: string | null;
  biography: string | null;
  former_kq_role: string | null;
  former_kq_department: string | null;
  kq_start_year: number | null;
  kq_end_year: number | null;
  current_job_title: string | null;
  current_organization: string | null;
  industry: string | null;
  location: string | null;
  mentorship_topics: string | null;
  skills: string[];
  synthetic: boolean;
};

export async function discoverableMentors(ids: string[]): Promise<DiscoverableMentor[]> {
  if (!ids.length) return [];
  if (ids.length > 50 || ids.some(id => !profileIdPattern.test(id))) throw new Error("Invalid profile selection");
  // Matching consent is also the boundary for this mentor-only profile view.
  // Recheck it here even if it changed after the matching service's SELECT.
  return (await database().query<DiscoverableMentor>(
    `SELECT p.id, p.full_name, p.headline, p.biography, p.former_kq_role,
      p.former_kq_department, p.kq_start_year, p.kq_end_year,
      p.current_job_title, p.current_organization, p.industry, p.location,
      m.mentorship_topics,
      COALESCE((SELECT array_agg(s.name ORDER BY s.name)
        FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id
        WHERE ps.profile_id = p.id), ARRAY[]::varchar[]) AS skills,
      (u.email LIKE '%@synthetic.lumina.local') AS synthetic
     FROM profiles p JOIN users u ON u.id = p.user_id
     JOIN mentorship_preferences m ON m.profile_id = p.id
     WHERE p.id = ANY($1::uuid[]) AND u.account_status = 'active'
       AND m.consent_to_matching = TRUE AND m.available_for_mentorship = TRUE`, [ids],
  )).rows;
}
