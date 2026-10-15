import type { Profile } from "./profiles";

// Presentation only; does not redefine the database's profile_completed flag.
const fields = ["full_name", "headline", "biography", "former_kq_role", "former_kq_department", "kq_start_year", "kq_end_year", "current_job_title", "current_organization", "industry", "location"] as const;
export function profileProgress(profile: Profile | null) {
  const completed = fields.filter(field => {
    const value = profile?.[field];
    return typeof value === "number" ? Number.isInteger(value) && value >= 1977 : typeof value === "string" && value.trim().length > 0;
  }).length;
  return { completed, total: fields.length, percentage: Math.round(completed / fields.length * 100) };
}
