import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { uuidPattern } from "@/lib/community-input";

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
    await conn.query(`INSERT INTO mentorship_preferences (profile_id, consent_to_matching, available_for_mentorship, mentorship_topics)
      VALUES ($1, $2, $3, $4) ON CONFLICT (profile_id) DO UPDATE SET consent_to_matching = EXCLUDED.consent_to_matching,
      available_for_mentorship = EXCLUDED.available_for_mentorship, mentorship_topics = EXCLUDED.mentorship_topics`,
      [profileId, settings.consent_to_matching, settings.available_for_mentorship, settings.mentorship_topics]);
    // Consent changes add or remove the embedding; topic changes alter its text.
    await enqueueProfileChange(conn, profileId, "mentorship");
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
