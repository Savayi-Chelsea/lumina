import "server-only";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { uuidPattern } from "@/lib/community-input";
import { SKILL_CATALOG, sortSkills } from "@/lib/skill-catalog";

export const BANNER_THEMES = { horizon: "Horizon", savanna: "Savanna", coast: "Coast", night: "Night flight", dawn: "Dawn" } as const;
export const SKILL_LIMIT = 30;
export const PHOTO_MAX_BYTES = 512 * 1024;

export class ProfileInputError extends Error {}
type Queryable = Pick<PoolClient, "query">;

/** Records that a profile's matching text may have changed; relayed to Kafka by the matching worker. */
export async function enqueueProfileChange(db: Queryable, profileId: string, reason: string) {
  await db.query("INSERT INTO profile_change_outbox (profile_id, reason) VALUES ($1, $2)", [profileId, reason]);
}

async function withTransaction<T>(work: (conn: PoolClient) => Promise<T>) {
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const result = await work(conn);
    await conn.query("COMMIT");
    return result;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function ownProfileId(userId: string) {
  return (await database().query<{ id: string }>("SELECT id FROM profiles WHERE user_id = $1", [userId])).rows[0]?.id || null;
}

const text = (data: FormData, name: string, label: string, max: number, required = false) => {
  const raw = data.get(name);
  const value = typeof raw === "string" ? raw.normalize("NFC").trim() : "";
  if (required && !value) throw new ProfileInputError(`${label} is required.`);
  if (value.length > max) throw new ProfileInputError(`${label} must be ${max} characters or fewer.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) throw new ProfileInputError(`${label} contains unsupported characters.`);
  return value || null;
};

// ---------- Experience ----------

export type ExperienceEntry = { id: string; organization: string; job_title: string; start_date: string | null; end_date: string | null; is_current: boolean; description: string | null };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export function parseExperience(data: FormData) {
  const month = (name: string, label: string, required: boolean) => {
    const raw = data.get(name);
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) { if (required) throw new ProfileInputError(`${label} is required.`); return null; }
    if (!MONTH.test(value) || Number(value.slice(0, 4)) < 1960 || value > new Date().toISOString().slice(0, 7)) throw new ProfileInputError(`${label} must be a month no later than this month.`);
    return `${value}-01`;
  };
  const isCurrent = data.get("is_current") === "on";
  const start = month("start_month", "Start", true);
  const end = isCurrent ? null : month("end_month", "End", true);
  if (start && end && end < start) throw new ProfileInputError("End must be on or after the start.");
  return {
    job_title: text(data, "job_title", "Title", 150, true)!,
    organization: text(data, "organization", "Organization", 200, true)!,
    description: text(data, "description", "Description", 2000),
    start_date: start, end_date: end, is_current: isCurrent,
  };
}

export async function listExperience(profileId: string) {
  return (await database().query<ExperienceEntry>(`SELECT id, organization, job_title, start_date::text, end_date::text, is_current, description
    FROM work_experience WHERE profile_id = $1 ORDER BY is_current DESC, start_date DESC NULLS LAST, id`, [profileId])).rows;
}

export async function saveExperience(profileId: string, input: ReturnType<typeof parseExperience>, entryId?: string) {
  if (entryId && !uuidPattern.test(entryId)) return false;
  return withTransaction(async conn => {
    const values = [profileId, input.organization, input.job_title, input.start_date, input.end_date, input.is_current, input.description];
    const result = entryId
      ? await conn.query(`UPDATE work_experience SET organization=$2, job_title=$3, start_date=$4, end_date=$5, is_current=$6, description=$7
          WHERE id = $8 AND profile_id = $1`, [...values, entryId])
      : await conn.query(`INSERT INTO work_experience (profile_id, organization, job_title, start_date, end_date, is_current, description)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, values);
    if (result.rowCount) await enqueueProfileChange(conn, profileId, "experience");
    return Boolean(result.rowCount);
  });
}

export async function deleteExperience(profileId: string, entryId: string) {
  if (!uuidPattern.test(entryId)) return false;
  return withTransaction(async conn => {
    const result = await conn.query("DELETE FROM work_experience WHERE id = $1 AND profile_id = $2", [entryId, profileId]);
    if (result.rowCount) await enqueueProfileChange(conn, profileId, "experience");
    return Boolean(result.rowCount);
  });
}

// ---------- Skills ----------

export function parseSkill(data: FormData) {
  const name = text(data, "skill", "Skill", 100, true)!.replace(/\s+/g, " ");
  if (name.length < 2) throw new ProfileInputError("Skill must be at least 2 characters.");
  return name;
}

/**
 * Picker options, A–Z: the skill catalog plus skills already listed on at least
 * two profiles (so one member's one-off entry is not offered to everyone).
 */
export async function skillOptions() {
  const used = (await database().query<{ name: string }>(`SELECT s.name FROM skills s JOIN profile_skills ps ON ps.skill_id = s.id
    GROUP BY s.id, s.name HAVING count(*) >= 2`)).rows.map(row => row.name);
  return sortSkills([...SKILL_CATALOG, ...used]);
}

export async function listSkills(profileId: string) {
  return (await database().query<{ id: string; name: string }>(`SELECT s.id, s.name FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id
    WHERE ps.profile_id = $1 ORDER BY lower(s.name)`, [profileId])).rows;
}

/** Reuses an existing skill name case-insensitively so the directory filter stays tidy. */
export async function addSkill(profileId: string, name: string): Promise<"added" | "exists" | "limit"> {
  return withTransaction(async conn => {
    const count = Number((await conn.query<{ n: number }>("SELECT count(*)::int AS n FROM profile_skills WHERE profile_id = $1", [profileId])).rows[0].n);
    if (count >= SKILL_LIMIT) return "limit";
    const existing = (await conn.query<{ id: string }>("SELECT id FROM skills WHERE lower(name) = lower($1) ORDER BY name LIMIT 1", [name])).rows[0];
    const skillId = existing?.id || (await conn.query<{ id: string }>("INSERT INTO skills (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", [name])).rows[0].id;
    const inserted = await conn.query("INSERT INTO profile_skills (profile_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [profileId, skillId]);
    if (!inserted.rowCount) return "exists";
    await enqueueProfileChange(conn, profileId, "skills");
    return "added";
  });
}

export async function removeSkill(profileId: string, skillId: string) {
  if (!uuidPattern.test(skillId)) return false;
  return withTransaction(async conn => {
    const result = await conn.query("DELETE FROM profile_skills WHERE profile_id = $1 AND skill_id = $2", [profileId, skillId]);
    if (result.rowCount) await enqueueProfileChange(conn, profileId, "skills");
    return Boolean(result.rowCount);
  });
}

// ---------- Mentorship settings ----------

export type MentorshipSettings = { consent_to_matching: boolean; available_for_mentorship: boolean; mentorship_topics: string | null };

export function parseMentorshipSettings(data: FormData): MentorshipSettings {
  const consent = data.get("consent_to_matching") === "on";
  const topics = text(data, "mentorship_topics", "Topics", 500);
  const list = (topics || "").split(/[|,\n]/).map(topic => topic.trim()).filter(Boolean);
  if (list.length > 10) throw new ProfileInputError("List up to 10 topics.");
  if (list.some(topic => topic.length > 80)) throw new ProfileInputError("Keep each topic to 80 characters or fewer.");
  // Availability only makes sense with matching consent.
  return { consent_to_matching: consent, available_for_mentorship: consent && data.get("available_for_mentorship") === "on", mentorship_topics: list.length ? list.join("|") : null };
}

export async function getMentorshipSettings(profileId: string): Promise<MentorshipSettings> {
  return (await database().query<MentorshipSettings>("SELECT consent_to_matching, available_for_mentorship, mentorship_topics FROM mentorship_preferences WHERE profile_id = $1", [profileId])).rows[0]
    || { consent_to_matching: false, available_for_mentorship: false, mentorship_topics: null };
}

export async function saveMentorshipSettings(profileId: string, settings: MentorshipSettings) {
  await withTransaction(async conn => {
    const previous = (await conn.query<{ consent_to_matching: boolean }>("SELECT consent_to_matching FROM mentorship_preferences WHERE profile_id = $1", [profileId])).rows[0];
    if ((previous?.consent_to_matching ?? false) !== settings.consent_to_matching) {
      // Matching consent is recorded in the member's consent history (Data Protection Act).
      await conn.query(`INSERT INTO privacy_consents (user_id, kind, value, policy_version) SELECT user_id, 'mentor_matching', $2, $3 FROM profiles WHERE id = $1`,
        [profileId, settings.consent_to_matching ? "granted" : "withdrawn", PRIVACY_POLICY_VERSION]);
    }
    await conn.query(`INSERT INTO mentorship_preferences (profile_id, consent_to_matching, available_for_mentorship, mentorship_topics)
      VALUES ($1, $2, $3, $4) ON CONFLICT (profile_id) DO UPDATE SET consent_to_matching = EXCLUDED.consent_to_matching,
      available_for_mentorship = EXCLUDED.available_for_mentorship, mentorship_topics = EXCLUDED.mentorship_topics`,
      [profileId, settings.consent_to_matching, settings.available_for_mentorship, settings.mentorship_topics]);
    // Consent changes add or remove the embedding; topic changes alter its text.
    await enqueueProfileChange(conn, profileId, "mentorship");
  });
}

// ---------- Import from a CV ----------

/**
 * What a member confirmed on the "Fill in from your CV" review screen. The CV
 * itself is read in the browser and never sent; only these confirmed values are.
 */
export type CvImport = {
  fields: Partial<Record<"headline" | "biography" | "current_job_title" | "current_organization" | "industry" | "location" | "former_kq_role" | "former_kq_department", string>>;
  kq_start_year: number | null; kq_end_year: number | null;
  experience: { job_title: string; organization: string; start_date: string; end_date: string | null; is_current: boolean; description: string | null }[];
  skills: string[];
};
const CV_FIELD_LIMITS = { headline: 200, biography: 5000, current_job_title: 150, current_organization: 200, industry: 150, location: 150, former_kq_role: 150, former_kq_department: 150 } as const;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const plain = (value: unknown, label: string, max: number) => {
  if (typeof value !== "string") throw new ProfileInputError(`${label} is missing.`);
  const cleaned = value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (cleaned.length > max) throw new ProfileInputError(`${label} must be ${max} characters or fewer.`);
  if (CONTROL.test(cleaned)) throw new ProfileInputError(`${label} contains unsupported characters.`);
  return cleaned;
};

/** Validates the review screen's JSON with the same rules as the individual editors. */
export function parseCvImport(raw: unknown, today = new Date()): CvImport {
  if (typeof raw !== "string" || raw.length > 100_000) throw new ProfileInputError("The CV details could not be read. Please try again.");
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { throw new ProfileInputError("The CV details could not be read. Please try again."); }
  if (!data || typeof data !== "object") throw new ProfileInputError("The CV details could not be read. Please try again.");
  const thisMonth = today.toISOString().slice(0, 7);
  const fields: CvImport["fields"] = {};
  const given = (data.fields && typeof data.fields === "object" ? data.fields : {}) as Record<string, unknown>;
  for (const [key, max] of Object.entries(CV_FIELD_LIMITS) as [keyof typeof CV_FIELD_LIMITS, number][]) {
    if (given[key] === undefined) continue;
    const value = plain(given[key], key.replaceAll("_", " "), max);
    if (value) fields[key] = value;
  }
  const year = (value: unknown, label: string) => {
    if (value === undefined || value === null || value === "") return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1977 || n > today.getFullYear()) throw new ProfileInputError(`${label} must be between 1977 and the current year.`);
    return n;
  };
  const kq_start_year = year(data.kq_start_year, "KQ start year"), kq_end_year = year(data.kq_end_year, "KQ end year");
  if (kq_start_year && kq_end_year && kq_end_year < kq_start_year) throw new ProfileInputError("KQ end year must be on or after start year.");
  const entries = Array.isArray(data.experience) ? data.experience : [];
  if (entries.length > 15) throw new ProfileInputError("Import at most 15 roles at a time.");
  const experience = entries.map((item, index) => {
    const entry = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = `Role ${index + 1}`;
    const job_title = plain(entry.job_title, `${label} title`, 150), organization = plain(entry.organization, `${label} organization`, 200);
    if (!job_title || !organization) throw new ProfileInputError(`${label} needs a title and an organization.`);
    const month = (value: unknown, what: string) => {
      if (typeof value !== "string" || !MONTH.test(value) || Number(value.slice(0, 4)) < 1960 || value > thisMonth) throw new ProfileInputError(`${label} ${what} must be a month no later than this month.`);
      return `${value}-01`;
    };
    const is_current = entry.is_current === true;
    const start_date = month(entry.start, "start");
    const end_date = is_current ? null : month(entry.end, "end");
    if (end_date && end_date < start_date) throw new ProfileInputError(`${label} must end on or after its start.`);
    return { job_title, organization, start_date, end_date, is_current, description: plain(entry.description ?? "", `${label} description`, 2000) || null };
  });
  const names = Array.isArray(data.skills) ? data.skills : [];
  if (names.length > SKILL_LIMIT) throw new ProfileInputError(`Choose at most ${SKILL_LIMIT} skills.`);
  const skills = sortSkills(names.map((name, index) => {
    const value = plain(name, `Skill ${index + 1}`, 100).replace(/\s+/g, " ");
    if (value.length < 2) throw new ProfileInputError("Each skill must be at least 2 characters.");
    return value;
  }));
  return { fields, kq_start_year, kq_end_year, experience, skills };
}

/** Saves confirmed CV details in one transaction; existing roles and skills are not duplicated. */
export async function importFromCv(profileId: string, input: CvImport) {
  return withTransaction(async conn => {
    const updates: [string, string | number][] = Object.entries(input.fields);
    if (input.kq_start_year) updates.push(["kq_start_year", input.kq_start_year]);
    if (input.kq_end_year) updates.push(["kq_end_year", input.kq_end_year]);
    if (updates.length) {
      await conn.query(`UPDATE profiles SET ${updates.map(([key], i) => `${key} = $${i + 2}`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [profileId, ...updates.map(([, value]) => value)]);
      // Same completeness rule as the profile form.
      await conn.query(`UPDATE profiles SET profile_completed = (full_name IS NOT NULL AND former_kq_role IS NOT NULL AND former_kq_department IS NOT NULL
        AND kq_start_year IS NOT NULL AND kq_end_year IS NOT NULL) WHERE id = $1`, [profileId]);
    }
    let roles = 0;
    for (const entry of input.experience) {
      const added = await conn.query(`INSERT INTO work_experience (profile_id, organization, job_title, start_date, end_date, is_current, description)
        SELECT $1::uuid, $2::text, $3::text, $4::date, $5::date, $6::boolean, $7::text WHERE NOT EXISTS (SELECT 1 FROM work_experience
          WHERE profile_id = $1::uuid AND lower(organization) = lower($2::text) AND lower(job_title) = lower($3::text) AND start_date IS NOT DISTINCT FROM $4::date)`,
        [profileId, entry.organization, entry.job_title, entry.start_date, entry.end_date, entry.is_current, entry.description]);
      roles += added.rowCount ?? 0;
    }
    let skills = 0, overLimit = 0;
    let count = Number((await conn.query<{ n: number }>("SELECT count(*)::int AS n FROM profile_skills WHERE profile_id = $1", [profileId])).rows[0].n);
    for (const name of input.skills) {
      const existing = (await conn.query<{ id: string }>("SELECT id FROM skills WHERE lower(name) = lower($1) ORDER BY name LIMIT 1", [name])).rows[0];
      if (existing && (await conn.query("SELECT 1 FROM profile_skills WHERE profile_id = $1 AND skill_id = $2", [profileId, existing.id])).rowCount) continue;
      if (count >= SKILL_LIMIT) { overLimit++; continue; }
      const skillId = existing?.id || (await conn.query<{ id: string }>("INSERT INTO skills (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id", [name])).rows[0].id;
      await conn.query("INSERT INTO profile_skills (profile_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [profileId, skillId]);
      skills++; count++;
    }
    if (updates.length || roles || skills) await enqueueProfileChange(conn, profileId, "cv_import");
    return { fields: updates.length, roles, skills, overLimit };
  });
}

// ---------- Photo ----------

/** Checks the file signature, not just the declared type. */
export function photoType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

export async function savePhoto(profileId: string, bytes: Uint8Array) {
  const type = photoType(bytes);
  if (!type) throw new ProfileInputError("Upload a JPEG, PNG or WebP image.");
  if (bytes.length < 100 || bytes.length > PHOTO_MAX_BYTES) throw new ProfileInputError("Photos must be smaller than 512 KB.");
  await database().query(`INSERT INTO profile_photos (profile_id, content_type, data) VALUES ($1, $2, $3)
    ON CONFLICT (profile_id) DO UPDATE SET content_type = EXCLUDED.content_type, data = EXCLUDED.data, updated_at = CURRENT_TIMESTAMP`, [profileId, type, Buffer.from(bytes)]);
}

export async function removePhoto(profileId: string) {
  await database().query("DELETE FROM profile_photos WHERE profile_id = $1", [profileId]);
}

/** Photos are visible to the owner and to anyone allowed to see the profile. */
export async function readPhoto(profileId: string, viewerId: string) {
  if (!uuidPattern.test(profileId)) return null;
  return (await database().query<{ content_type: string; data: Buffer }>(`SELECT ph.content_type, ph.data FROM profile_photos ph
    JOIN profiles p ON p.id = ph.profile_id JOIN users u ON u.id = p.user_id
    WHERE ph.profile_id = $1 AND (u.id = $2 OR (u.account_status = 'active' AND u.alumni_verified AND u.role = 'alumni'))`, [profileId, viewerId])).rows[0] || null;
}
