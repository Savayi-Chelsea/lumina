export const MAX_MENTOR_QUERY_LENGTH = 500;
export const mentorPrompts = [
  "I want to move from IT support into AWS cloud engineering and DevOps.",
  "I’m looking for guidance on aviation leadership and moving into operations management.",
  "How can I use my cabin crew experience to build a career in customer experience?",
] as const;

export function canDiscoverMentors(user: { role: string; accountStatus: string; alumniVerified: boolean }) {
  return user.accountStatus === "active" && (user.role === "admin" || (user.role === "alumni" && user.alumniVerified));
}

export class MentorQueryError extends Error {}
export function validateMentorQuery(value: unknown): string {
  if (typeof value !== "string") throw new MentorQueryError("Describe what you would like help with.");
  if (Array.from(value).length > MAX_MENTOR_QUERY_LENGTH) throw new MentorQueryError("Keep your request to 500 characters or fewer.");
  if (Array.from(value).some(char => /\p{C}/u.test(char) && !/\s/u.test(char))) {
    throw new MentorQueryError("Remove invisible or unsupported characters and try again.");
  }
  const query = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!query) throw new MentorQueryError("Describe what you would like help with.");
  return query;
}

export const profileIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type MentorMatch = {
  profileId: string;
  name: string;
  headline: string | null;
  formerRole: string | null;
  department: string | null;
  currentPosition: string | null;
  organization: string | null;
  skills: string[];
  matchRelevance: number;
  availableForMentorship: true;
  synthetic: boolean;
  reasons?: string[];
};

export function isMentorMatch(value: unknown): value is MentorMatch {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.profileId === "string" && profileIdPattern.test(item.profileId)
    && typeof item.name === "string" && item.name.length <= 150
    && ["headline", "formerRole", "department", "currentPosition", "organization"].every(key => item[key] === null || (typeof item[key] === "string" && item[key].length <= 200))
    && Array.isArray(item.skills) && item.skills.length <= 100 && item.skills.every(skill => typeof skill === "string" && skill.length <= 100)
    && typeof item.matchRelevance === "number" && Number.isFinite(item.matchRelevance) && item.matchRelevance >= -1 && item.matchRelevance <= 1
    && item.availableForMentorship === true && typeof item.synthetic === "boolean"
    && (item.reasons === undefined || (Array.isArray(item.reasons) && item.reasons.length <= 5 && item.reasons.every(reason => typeof reason === "string" && reason.length <= 300)));
}
