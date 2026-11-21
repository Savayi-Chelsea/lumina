// Are "Why this match" explanations grounded in the mentor's stored profile?
//
//   1. Start the matching service (port 8000).
//   2. node --no-warnings scripts/evaluate_explanations.mjs
//
// For each of the 22 labelled queries, the live service ranks mentors; each mentor is
// then loaded with the same SQL the app uses (discoverableMentors) and explained with
// the app's own explainMatch (src/lib/match-explanation.ts). Every reason sentence is
// then checked independently against the stored attributes:
//   grounded       the sentence is exactly one of the explanation templates filled only
//                  with values stored on that mentor's profile (skills, mentorship topics,
//                  current title/organisation/industry, former KQ role/department);
//   word_overlap   for overlap-based reasons, a separate simple tokenizer confirms that the
//                  cited attribute shares at least one word with the member's query.
// Writes evaluation/results/correctness/explanations.csv and explanations_summary.json.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { explainMatch } from "../src/lib/match-explanation.ts";

nextEnv.loadEnvConfig(process.cwd());
const base = (process.env.MATCHING_SERVICE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const out = "evaluation/results/correctness";
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.POSTGRES_HOST || "localhost", port: Number(process.env.POSTGRES_PORT || 5432),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB,
});
// Same columns and eligibility rule as src/lib/mentor-profiles.ts discoverableMentors().
const MENTORS_SQL = `SELECT p.id, split_part(u.email, '@', 1) AS label, p.former_kq_role, p.former_kq_department,
  p.current_job_title, p.current_organization, p.industry, m.mentorship_topics,
  COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id
    WHERE ps.profile_id = p.id), ARRAY[]::varchar[]) AS skills
  FROM profiles p JOIN users u ON u.id = p.user_id JOIN mentorship_preferences m ON m.profile_id = p.id
  WHERE p.id = ANY($1::uuid[]) AND u.account_status = 'active' AND m.consent_to_matching AND m.available_for_mentorship`;

// Independent of the explanation module: lowercase words of 3+ letters with a light suffix fold.
const fold = word => word.replace(/(ing|ers|er|ed|es|s)$/u, "") || word;
const words = text => new Set((text.toLowerCase().match(/[a-z0-9+#]{3,}/g) || []).map(fold));
const sharesWord = (a, b) => { const left = words(a); return [...words(b)].some(word => left.has(word)); };
const topicsOf = mentor => (mentor.mentorship_topics || "").split("|").map(t => t.trim()).filter(Boolean);

function check(reason, mentor, query) {
  const now = [mentor.current_job_title, mentor.current_organization].filter(Boolean).join(" at ");
  const former = `${mentor.former_kq_role}${mentor.former_kq_department ? ` in ${mentor.former_kq_department}` : ""}`;
  let match;
  if ((match = /^Skilled in (.+)$/.exec(reason))) {
    const cited = match[1].split(", ");
    return { type: "skill overlap", grounded: cited.every(skill => mentor.skills.includes(skill)),
      overlap: cited.every(skill => sharesWord(query, skill)), cited: cited.join("; ") };
  }
  if ((match = /^Mentors on (.+)$/.exec(reason))) {
    const topics = topicsOf(mentor);
    const options = [...topics.map(t => [t]), ...topics.flatMap((a, i) => topics.slice(i + 1).map(b => [a, b]))];
    const cited = options.find(option => option.join(" and ") === match[1]);
    return { type: "mentorship topic overlap", grounded: Boolean(cited), overlap: Boolean(cited?.every(t => sharesWord(query, t))), cited: cited?.join("; ") || match[1] };
  }
  if (reason.startsWith("Works as ")) {
    const expected = `Works as ${now}${mentor.industry ? ` (${mentor.industry})` : ""}`;
    return { type: "current role overlap", grounded: Boolean(now) && reason === expected,
      overlap: sharesWord(query, mentor.current_job_title || "") || sharesWord(query, mentor.industry || ""), cited: now };
  }
  if (reason.startsWith("Former ")) {
    return { type: "former KQ role overlap", grounded: Boolean(mentor.former_kq_role) && reason === `Former ${former} at Kenya Airways`,
      overlap: sharesWord(query, mentor.former_kq_role || "") || sharesWord(query, mentor.former_kq_department || ""), cited: former };
  }
  if (reason.startsWith("Now ")) return { type: "fallback: current role", grounded: Boolean(now) && reason === `Now ${now}`, overlap: null, cited: now };
  if (reason.startsWith("Previously ")) return { type: "fallback: former role", grounded: Boolean(mentor.former_kq_role) && reason === `Previously ${former}`, overlap: null, cited: former };
  return { type: "unrecognised", grounded: false, overlap: null, cited: "" };
}

const csvCell = value => /[",\n]/.test(String(value ?? "")) ? `"${String(value).replace(/"/g, '""')}"` : String(value ?? "");
try {
  const labels = JSON.parse(await readFile("evaluation/relevance_labels.json", "utf8"));
  const rows = [];
  let results = 0, withoutReasons = 0;
  for (const item of labels.queries) {
    const response = await fetch(`${base}/mentors/search`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: item.query }) });
    if (!response.ok) throw new Error(`matching service returned ${response.status}`);
    const ranked = (await response.json()).results;
    const mentors = new Map((await pool.query(MENTORS_SQL, [ranked.map(r => r.profile_id)])).rows.map(row => [row.id, row]));
    ranked.forEach((result, index) => {
      const mentor = mentors.get(result.profile_id);
      if (!mentor) return;
      results++;
      const reasons = explainMatch(item.query, mentor);
      if (!reasons.length) withoutReasons++;
      for (const reason of reasons) {
        const verdict = check(reason, mentor, item.query);
        rows.push({ query_id: item.id, set: item.set, rank: index + 1, mentor: mentor.label, reason, claim_type: verdict.type,
          cited_attribute: verdict.cited, grounded: verdict.grounded, word_overlap: verdict.overlap ?? "n/a (fallback states facts only)" });
      }
    });
  }
  const overlapRows = rows.filter(r => typeof r.word_overlap === "boolean");
  const byType = Object.fromEntries([...new Set(rows.map(r => r.claim_type))].sort().map(type => [type, rows.filter(r => r.claim_type === type).length]));
  const summary = {
    evaluated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), queries: labels.queries.length, mentor_results_explained: results,
    results_without_reasons: withoutReasons, reasons: rows.length, reasons_per_result: Number((rows.length / Math.max(results, 1)).toFixed(2)),
    grounded: rows.filter(r => r.grounded).length, not_grounded: rows.filter(r => !r.grounded).length,
    overlap_based_reasons: overlapRows.length, overlap_confirmed_by_independent_tokenizer: overlapRows.filter(r => r.word_overlap).length,
    fallback_reasons: rows.length - overlapRows.length, reasons_by_type: byType,
  };
  await mkdir(out, { recursive: true });
  const fields = ["query_id", "set", "rank", "mentor", "reason", "claim_type", "cited_attribute", "grounded", "word_overlap"];
  await writeFile(`${out}/explanations.csv`, [fields.join(","), ...rows.map(r => fields.map(f => csvCell(r[f])).join(","))].join("\n") + "\n");
  await writeFile(`${out}/explanations_summary.json`, JSON.stringify(summary, null, 2) + "\n");
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.not_grounded ? 1 : 0;
} finally { await pool.end(); }
