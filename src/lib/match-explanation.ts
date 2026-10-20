// Grounded, rule-based match explanations. Every statement is built only from the
// mentor's stored profile fields that overlap with the member's own words, so the
// explanation can never claim something the profile does not say.

const STOP = new Set(["the", "and", "for", "with", "into", "from", "that", "this", "want", "would", "like", "how", "can", "help", "about", "career", "careers", "move", "moving", "work", "working", "job", "role", "roles", "get", "make", "need", "advice", "guidance", "looking", "become", "using", "use", "my", "your", "our", "new", "more", "what", "who", "where", "when", "why", "will", "i'm", "ive", "im"]);

const stem = (word: string) => word.replace(/(ing|ers|er|ed|es|s)$/u, "") || word;
export function terms(text: string) {
  return new Set((text.toLocaleLowerCase("en").match(/[\p{L}\p{N}+#/.-]{3,}/gu) || [])
    .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}+#]+$/gu, ""))
    .filter(word => word.length >= 3 && !STOP.has(word)).map(stem));
}
const overlaps = (query: Set<string>, text: string) => [...terms(text)].some(term => query.has(term));

export type ExplainableMentor = {
  skills: string[]; mentorship_topics: string | null; current_job_title: string | null; current_organization: string | null;
  industry: string | null; former_kq_role: string | null; former_kq_department: string | null;
};

export function explainMatch(query: string, mentor: ExplainableMentor): string[] {
  const words = terms(query);
  const reasons: string[] = [];
  const skills = (mentor.skills || []).filter(skill => overlaps(words, skill)).slice(0, 3);
  if (skills.length) reasons.push(`Skilled in ${skills.join(", ")}`);
  const topics = (mentor.mentorship_topics || "").split("|").map(topic => topic.trim()).filter(topic => topic && overlaps(words, topic)).slice(0, 2);
  if (topics.length) reasons.push(`Mentors on ${topics.join(" and ")}`);
  const now = [mentor.current_job_title, mentor.current_organization].filter(Boolean).join(" at ");
  if (now && (overlaps(words, mentor.current_job_title || "") || overlaps(words, mentor.industry || ""))) reasons.push(`Works as ${now}${mentor.industry ? ` (${mentor.industry})` : ""}`);
  if (mentor.former_kq_role && (overlaps(words, mentor.former_kq_role) || overlaps(words, mentor.former_kq_department || ""))) reasons.push(`Former ${mentor.former_kq_role}${mentor.former_kq_department ? ` in ${mentor.former_kq_department}` : ""} at Kenya Airways`);
  // Ranked by meaning rather than shared words: state the facts the ranking drew on.
  if (!reasons.length) {
    if (now) reasons.push(`Now ${now}`);
    if (mentor.former_kq_role) reasons.push(`Previously ${mentor.former_kq_role}${mentor.former_kq_department ? ` in ${mentor.former_kq_department}` : ""}`);
  }
  return reasons.slice(0, 3);
}
