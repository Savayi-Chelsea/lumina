import "server-only";
import { discoverableMentors } from "@/lib/mentor-profiles";
import { profileIdPattern, validateMentorQuery, type MentorMatch } from "@/lib/mentorship-contract";

type ServiceMatch = {
  profile_id: string; headline: string | null; former_kq_role: string | null;
  former_kq_department: string | null; current_job_title: string | null;
  current_organization: string | null; relevant_skills: string[]; similarity_score: number;
};
export class MatchingUnavailable extends Error {}
export class MatchingQueryRejected extends Error {}

export async function limitedJson(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<unknown> {
  if (!body) throw new Error("Missing JSON");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new Error("JSON size limit exceeded");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export function parseServiceResults(value: unknown): ServiceMatch[] {
  if (!value || typeof value !== "object") throw new MatchingUnavailable();
  const data = value as Record<string, unknown>;
  if (!Number.isInteger(data.top_k) || Number(data.top_k) < 1 || Number(data.top_k) > 50
    || typeof data.similarity_threshold !== "number" || !Number.isFinite(data.similarity_threshold)
    || data.similarity_threshold < -1 || data.similarity_threshold > 1
    || !Array.isArray(data.results) || data.results.length > Number(data.top_k)) throw new MatchingUnavailable();
  const ids = new Set<string>();
  const threshold = data.similarity_threshold as number;
  let previousScore = Infinity;
  return data.results.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new MatchingUnavailable();
    const row = value as Record<string, unknown>;
    const nullable = ["headline", "former_kq_role", "former_kq_department", "current_job_title", "current_organization"];
    if (typeof row.profile_id !== "string" || !profileIdPattern.test(row.profile_id)
      || ids.has(row.profile_id.toLowerCase()) || nullable.some(key => row[key] !== null && (typeof row[key] !== "string" || row[key].length > 200))
      || !Array.isArray(row.relevant_skills) || row.relevant_skills.length > 100 || row.relevant_skills.some(skill => typeof skill !== "string" || skill.length > 100)
      || typeof row.similarity_score !== "number" || !Number.isFinite(row.similarity_score)
      || row.similarity_score < threshold || row.similarity_score < -1 || row.similarity_score > 1
      || row.similarity_score > previousScore) throw new MatchingUnavailable();
    ids.add(row.profile_id.toLowerCase()); previousScore = row.similarity_score;
    // Construct an allowlist rather than forwarding unknown response fields.
    return {
      profile_id: row.profile_id.toLowerCase(), headline: row.headline as string | null,
      former_kq_role: row.former_kq_role as string | null, former_kq_department: row.former_kq_department as string | null,
      current_job_title: row.current_job_title as string | null, current_organization: row.current_organization as string | null,
      relevant_skills: row.relevant_skills as string[], similarity_score: row.similarity_score,
    };
  });
}

export async function searchMentors(rawQuery: unknown): Promise<MentorMatch[]> {
  const query = validateMentorQuery(rawQuery);
  try {
    const configured = process.env.MATCHING_SERVICE_URL;
    if (!configured) throw new MatchingUnavailable();
    const base = new URL(configured.endsWith("/") ? configured : `${configured}/`);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new MatchingUnavailable();
    const timeout = Number(process.env.MATCHING_SERVICE_TIMEOUT_MS || "60000");
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 120000) throw new MatchingUnavailable();
    const response = await fetch(new URL("mentors/search", base), {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout),
    });
    if (response.status === 422) throw new MatchingQueryRejected();
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new MatchingUnavailable();
    const ranked = parseServiceResults(await limitedJson(response.body, 256 * 1024));
    const profiles = await discoverableMentors(ranked.map(match => match.profile_id));
    const byId = new Map(profiles.map(profile => [profile.id, profile]));
    return ranked.flatMap(match => {
      const profile = byId.get(match.profile_id);
      if (!profile) return []; // Withdrawn consent or unavailable account: never expose it.
      return [{
        profileId: match.profile_id, name: profile.full_name || "Alumni mentor",
        headline: match.headline, formerRole: match.former_kq_role, department: match.former_kq_department,
        currentPosition: match.current_job_title, organization: match.current_organization,
        skills: match.relevant_skills, matchRelevance: match.similarity_score,
        availableForMentorship: true as const, synthetic: profile.synthetic,
      }];
    });
  } catch (error) {
    if (error instanceof MatchingQueryRejected) throw error;
    throw new MatchingUnavailable();
  }
}
