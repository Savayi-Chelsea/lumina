export function googleProfileImage(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".googleusercontent.com") && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function profileInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => Array.from(part)[0]).join("").toUpperCase() || "L";
}

const UPLOADED_PHOTO = /^\/api\/profile-photo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\?v=\d{1,15}$/;
/** A member's display photo: Lumina's own photo route or a validated Google picture. */
export function profileImage(value: unknown): string | null {
  return typeof value === "string" && UPLOADED_PHOTO.test(value) ? value : googleProfileImage(value);
}
