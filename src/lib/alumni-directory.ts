import "server-only";
import { database } from "@/lib/db";
import { profileIdPattern } from "@/lib/mentorship-contract";
import { DIRECTORY_PAGE_SIZE, parseDirectoryQuery, type DirectoryQuery } from "@/lib/network-query";
import { profileImage } from "@/lib/profile-image";
import { profileImageSql } from "@/lib/profile-image-sql";

// Shared by directory, Home and direct profile URLs. Mentorship opt-in is separate.
const visible = `u.account_status = 'active' AND u.alumni_verified = TRUE
  AND u.role = 'alumni' AND length(btrim(p.full_name)) > 0`;
const fields = `p.id, p.full_name, p.headline, p.biography, p.former_kq_role,
 p.former_kq_department, p.kq_start_year, p.kq_end_year, p.current_job_title,
 p.current_organization, p.industry, p.location, ${profileImageSql("p", "u")} AS image,
 p.open_to_opportunities, p.banner_theme,
 (u.email LIKE '%@synthetic.lumina.local') AS synthetic,
 COALESCE(m.available_for_mentorship AND m.consent_to_matching, FALSE) AS mentorship_available,
 CASE WHEN m.available_for_mentorship AND m.consent_to_matching THEN m.mentorship_topics ELSE NULL END AS mentorship_topics,
 COALESCE((SELECT array_agg(s.name ORDER BY s.name) FROM profile_skills ps
 JOIN skills s ON s.id = ps.skill_id WHERE ps.profile_id = p.id), ARRAY[]::varchar[]) AS skills`;
const relations = `FROM profiles p JOIN users u ON u.id = p.user_id
 LEFT JOIN mentorship_preferences m ON m.profile_id = p.id`;
export type AlumniSummary = {
 id: string; full_name: string; headline: string | null; biography: string | null;
 former_kq_role: string | null; former_kq_department: string | null;
 kq_start_year: number | null; kq_end_year: number | null;
 current_job_title: string | null; current_organization: string | null;
 industry: string | null; location: string | null; image: string | null;
 synthetic: boolean; mentorship_available: boolean; mentorship_topics: string | null; skills: string[];
 open_to_opportunities: boolean; banner_theme: string;
};
export type WorkExperience = { organization: string; job_title: string; start_date: string | null; end_date: string | null; is_current: boolean; description: string | null };
function safeImage(profile: AlumniSummary) { return { ...profile, image: profileImage(profile.image) }; }
export async function searchAlumni(input: DirectoryQuery) {
 const query = parseDirectoryQuery({ ...input, page: String(input.page) });
 const values: (string | number)[] = [];
 const conditions = [visible];
 const bind = (value: string | number) => { values.push(value); return `$${values.length}`; };
 if (query.q) {
   const pattern = bind(`%${query.q.replace(/[\\%_]/g, value => `\\${value}`)}%`);
   conditions.push(`(p.full_name ILIKE ${pattern} OR p.headline ILIKE ${pattern} OR p.former_kq_role ILIKE ${pattern} OR p.current_job_title ILIKE ${pattern} OR p.current_organization ILIKE ${pattern})`);
 }
 for (const [key, column] of [["department", "former_kq_department"], ["industry", "industry"], ["location", "location"]] as const) if (query[key]) conditions.push(`p.${column} = ${bind(query[key])}`);
 if (query.skill) conditions.push(`EXISTS (SELECT 1 FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id WHERE ps.profile_id = p.id AND s.name = ${bind(query.skill)})`);
 const where = conditions.join(" AND ");
 const total = Number((await database().query<{ total: number }>(`SELECT count(*)::int AS total ${relations} WHERE ${where}`, values)).rows[0].total);
 const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
 const page = Math.min(query.page, pages);
 const limit = bind(DIRECTORY_PAGE_SIZE); const offset = bind((page - 1) * DIRECTORY_PAGE_SIZE);
 const rows = (await database().query<AlumniSummary>(`SELECT ${fields} ${relations} WHERE ${where} ORDER BY lower(p.full_name), p.id LIMIT ${limit} OFFSET ${offset}`, values)).rows.map(safeImage);
 return { profiles: rows, total, pages, page };
}
export async function directoryOptions() {
 const rows = (await database().query<{ kind: "department" | "industry" | "location" | "skill"; value: string }>(`
 SELECT DISTINCT options.kind, options.value ${relations}
 CROSS JOIN LATERAL (VALUES ('department', p.former_kq_department), ('industry', p.industry), ('location', p.location)) options(kind, value)
 WHERE ${visible} AND length(btrim(options.value)) > 0
 UNION SELECT DISTINCT 'skill', s.name ${relations}
 JOIN profile_skills ps ON ps.profile_id = p.id JOIN skills s ON s.id = ps.skill_id
 WHERE ${visible} ORDER BY kind, value`)).rows;
 const options = { department: [] as string[], industry: [] as string[], location: [] as string[], skill: [] as string[] };
 for (const row of rows) options[row.kind].push(row.value);
 return options;
}
export async function alumniProfile(id: string) {
 if (!profileIdPattern.test(id)) return null;
 const profile = (await database().query<AlumniSummary>(`SELECT ${fields} ${relations} WHERE ${visible} AND p.id = $1::uuid`, [id])).rows[0];
 if (!profile) return null;
 const experience = (await database().query<WorkExperience>(`SELECT organization, job_title, start_date::text, end_date::text, is_current, description FROM work_experience WHERE profile_id = $1::uuid ORDER BY is_current DESC, start_date DESC NULLS LAST, id`, [id])).rows;
 return { ...safeImage(profile), experience };
}
/** The signed-in member's own profile, shown even before verification. */
export async function ownProfileView(userId: string) {
 const profile = (await database().query<AlumniSummary>(`SELECT ${fields} ${relations} WHERE u.id = $1::uuid`, [userId])).rows[0];
 if (!profile) return null;
 const experience = (await database().query<WorkExperience>(`SELECT organization, job_title, start_date::text, end_date::text, is_current, description FROM work_experience WHERE profile_id = $1::uuid ORDER BY is_current DESC, start_date DESC NULLS LAST, id`, [profile.id])).rows;
 return { ...safeImage(profile), experience };
}

/** "People also viewed": others from the same former department. */
export async function relatedAlumni(profileId: string, department: string | null) {
 return (await database().query<AlumniSummary>(`SELECT ${fields} ${relations} WHERE ${visible} AND p.id <> $1::uuid
 ORDER BY (p.former_kq_department = $2) DESC NULLS LAST, p.id LIMIT 4`, [profileId, department])).rows.map(safeImage);
}

export async function homeAlumni(userId: string, department: string | null) {
 return (await database().query<AlumniSummary>(`SELECT ${fields} ${relations} WHERE ${visible} AND u.id <> $1::uuid
 ORDER BY (p.former_kq_department = $2) DESC NULLS LAST, p.created_at DESC, p.id LIMIT 3`, [userId, department])).rows.map(safeImage);
}
