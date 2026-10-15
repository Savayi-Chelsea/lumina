import "server-only";
import { database } from "@/lib/db";
export const profileFields = { full_name: 150, headline: 200, biography: 5000, former_kq_role: 150, former_kq_department: 150, current_job_title: 150, current_organization: 200, industry: 150, location: 150 } as const;
export type Profile = Record<keyof typeof profileFields, string | null> & { kq_start_year: number | null; kq_end_year: number | null; profile_completed: boolean };
export async function getProfile(id: string): Promise<Profile | null> {
  return (await database().query<Profile>("SELECT * FROM profiles WHERE user_id = $1", [id])).rows[0] || null;
}
export function parseProfile(data: FormData) {
  const values: Record<string, string | number | null> = {};
  for (const [field, max] of Object.entries(profileFields)) {
    const raw = data.get(field);
    if (raw !== null && typeof raw !== "string") throw new Error("Invalid profile field.");
    const value = (raw || "").trim();
    if (value.length > max) throw new Error(`${field.replaceAll("_", " ")} must be ${max} characters or fewer.`);
    values[field] = value || null;
  }
  if (!values.full_name) throw new Error("Full name is required.");
  for (const field of ["kq_start_year", "kq_end_year"]) {
    const raw = data.get(field);
    if (raw === null || raw === "") { values[field] = null; continue; }
    if (typeof raw !== "string" || !/^\d{4}$/.test(raw) || Number(raw) < 1977 || Number(raw) > new Date().getFullYear()) throw new Error("KQ years must be between 1977 and the current year.");
    values[field] = Number(raw);
  }
  if (values.kq_start_year && values.kq_end_year && values.kq_end_year < values.kq_start_year) throw new Error("KQ end year must be on or after start year.");
  return values;
}
export async function saveProfile(id: string, values: ReturnType<typeof parseProfile>) {
  const fields = [...Object.keys(profileFields), "kq_start_year", "kq_end_year"];
  const completed = Boolean(values.full_name && values.former_kq_role && values.former_kq_department && values.kq_start_year && values.kq_end_year);
  await database().query(`INSERT INTO profiles (user_id, ${fields.join(", ")}, profile_completed) VALUES ($1, ${fields.map((_, i) => `$${i + 2}`).join(", ")}, $${fields.length + 2}) ON CONFLICT (user_id) DO UPDATE SET ${fields.map(f => `${f} = EXCLUDED.${f}`).join(", ")}, profile_completed = EXCLUDED.profile_completed, updated_at = CURRENT_TIMESTAMP`, [id, ...fields.map(f => values[f]), completed]);
}
