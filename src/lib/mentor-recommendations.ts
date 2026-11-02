import "server-only";
import { database } from "@/lib/db";
import { discoverableMentors } from "@/lib/mentor-profiles";
import { explainMatch } from "@/lib/match-explanation";
import { logSearch } from "@/lib/match-tracking";
import { callMatching, limitedJson, parseServiceResults } from "@/lib/mentor-search";
import type { MentorMatch } from "@/lib/mentorship-contract";

/**
 * "Mentors for you": the BGE model embeds the member's own profile and finds the
 * mentors whose profiles are closest, with no search needed. Mentors the member
 * already asked or works with are left out. Failures return nothing, so Home
 * never breaks when the matching service is down.
 */
export async function recommendMentors(userId: string, limit = 3): Promise<{ mentors: MentorMatch[]; searchId: string | null }> {
  try {
    const member = (await database().query<{ id: string; text: string; exclude: string[] }>(`
      SELECT p.id, concat_ws(' ', p.headline, p.current_job_title, p.industry, p.former_kq_department,
          (SELECT string_agg(s.name, ' ') FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.profile_id = p.id)) AS text,
        COALESCE((SELECT array_agg(mp.id) FROM mentorship_requests r JOIN profiles mp ON mp.user_id = r.mentor_id
          WHERE r.mentee_id = $1 AND r.status IN ('pending', 'accepted')), ARRAY[]::uuid[])::text[] AS exclude
      FROM profiles p WHERE p.user_id = $1`, [userId])).rows[0];
    if (!member || !member.text.trim()) return { mentors: [], searchId: null };
    const response = await callMatching("mentors/recommend", { profile_id: member.id, top_k: limit, exclude: member.exclude.slice(0, 200) });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return { mentors: [], searchId: null };
    const body = await limitedJson(response.body, 128 * 1024) as Record<string, unknown>;
    // Reuse the strict result validation; recommendations share the result shape.
    const ranked = parseServiceResults({ ...body, top_k: limit, similarity_threshold: -1 });
    const profiles = new Map((await discoverableMentors(ranked.map(match => match.profile_id))).map(profile => [profile.id, profile]));
    const mentors = ranked.flatMap(match => {
      const profile = profiles.get(match.profile_id);
      if (!profile) return [];
      return [{
        profileId: match.profile_id, name: profile.full_name || "Alumni mentor", headline: match.headline,
        formerRole: match.former_kq_role, department: match.former_kq_department, currentPosition: match.current_job_title,
        organization: match.current_organization, skills: match.relevant_skills, matchRelevance: match.similarity_score,
        availableForMentorship: true as const, synthetic: profile.synthetic, reasons: explainMatch(member.text, profile),
      }];
    });
    const searchId = mentors.length ? await logSearch(userId, "recommendation", mentors.map(m => ({ profileId: m.profileId, score: m.matchRelevance }))) : null;
    return { mentors, searchId };
  } catch {
    return { mentors: [], searchId: null };
  }
}
