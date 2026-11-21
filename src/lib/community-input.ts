// Validation for admin-managed events and opportunities. Pure: safe to unit test.
export const EVENT_CATEGORIES = ["Reunion", "Career conversation", "Mentorship circle", "Workshop", "Networking", "Community service"] as const;
export const EVENT_FORMATS = { in_person: "In person", online: "Online", hybrid: "Hybrid" } as const;
export const OPPORTUNITY_TYPES = ["Job", "Contract", "Advisory", "Volunteer", "Internship"] as const;
export const WORK_MODES = { on_site: "On site", remote: "Remote", hybrid: "Hybrid" } as const;
export const PUBLICATION = ["draft", "published", "archived"] as const;
export type Publication = typeof PUBLICATION[number];
// Lumina's community is Nairobi-based; East Africa Time has no daylight saving.
export const COMMUNITY_TIME_ZONE = "Africa/Nairobi";
const EAT_OFFSET = "+03:00";

export class CommunityInputError extends Error {}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(data: FormData, name: string, label: string, max: number, required = true) {
  const raw = data.get(name);
  const value = typeof raw === "string" ? raw.normalize("NFC").trim() : "";
  if (required && !value) throw new CommunityInputError(`${label} is required.`);
  if (value.length > max) throw new CommunityInputError(`${label} must be ${max} characters or fewer.`);
  if (/[\p{Cc}]/u.test(value.replace(/[\r\n\t]/g, ""))) throw new CommunityInputError(`${label} contains unsupported characters.`);
  return value || null;
}

function choice<T extends string>(data: FormData, name: string, label: string, options: readonly T[]): T {
  const value = data.get(name);
  if (typeof value !== "string" || !options.includes(value as T)) throw new CommunityInputError(`Choose a valid ${label.toLowerCase()}.`);
  return value as T;
}

/** Converts a datetime-local value entered in East Africa Time to an ISO instant. */
export function eatDateTime(value: unknown, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new CommunityInputError(`${label} is required.`);
  const instant = new Date(`${value}:00${EAT_OFFSET}`);
  if (Number.isNaN(instant.getTime())) throw new CommunityInputError(`${label} is not a valid date and time.`);
  return instant.toISOString();
}

/** Formats an instant back into the datetime-local value an admin edits. */
export function toEatInput(value: string | Date) {
  const shifted = new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function publicationIntent(data: FormData): Publication {
  return choice(data, "intent", "Publication status", PUBLICATION);
}

export function parseEvent(data: FormData) {
  const startsAt = eatDateTime(data.get("starts_at"), "Start");
  const endsAt = eatDateTime(data.get("ends_at"), "End");
  if (new Date(endsAt) <= new Date(startsAt)) throw new CommunityInputError("End must be after the start.");
  const capacityRaw = data.get("capacity");
  let capacity: number | null = null;
  if (typeof capacityRaw === "string" && capacityRaw.trim()) {
    if (!/^\d{1,4}$/.test(capacityRaw.trim()) || Number(capacityRaw) < 1 || Number(capacityRaw) > 5000) throw new CommunityInputError("Capacity must be a whole number from 1 to 5000, or left blank.");
    capacity = Number(capacityRaw);
  }
  return {
    title: text(data, "title", "Title", 150)!,
    summary: text(data, "summary", "Summary", 300)!,
    description: text(data, "description", "Description", 5000)!,
    category: choice(data, "category", "Category", EVENT_CATEGORIES),
    format: choice(data, "format", "Format", Object.keys(EVENT_FORMATS) as (keyof typeof EVENT_FORMATS)[]),
    location: text(data, "location", "Location", 200)!,
    starts_at: startsAt, ends_at: endsAt, capacity,
  };
}
export type EventInput = ReturnType<typeof parseEvent>;

export function parseOpportunity(data: FormData) {
  const closes = data.get("closes_on");
  let closesOn: string | null = null;
  if (typeof closes === "string" && closes) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(closes) || Number.isNaN(Date.parse(closes))) throw new CommunityInputError("Closing date is not valid.");
    closesOn = closes;
  }
  return {
    title: text(data, "title", "Title", 150)!,
    organization: text(data, "organization", "Organization", 200)!,
    opportunity_type: choice(data, "opportunity_type", "Type", OPPORTUNITY_TYPES),
    work_mode: choice(data, "work_mode", "Work mode", Object.keys(WORK_MODES) as (keyof typeof WORK_MODES)[]),
    location: text(data, "location", "Location", 150)!,
    industry: text(data, "industry", "Industry", 150, false),
    summary: text(data, "summary", "Summary", 300)!,
    description: text(data, "description", "Description", 5000)!,
    how_to_apply: text(data, "how_to_apply", "How to apply", 1000)!,
    closes_on: closesOn,
  };
}
export type OpportunityInput = ReturnType<typeof parseOpportunity>;

const one = (value: string | string[] | undefined) => typeof value === "string" ? value : undefined;
export function parseEventFilters(params: Record<string, string | string[] | undefined>) {
  const view = one(params.view) === "past" ? "past" as const : "upcoming" as const;
  const format = one(params.format);
  return { view, format: format && format in EVENT_FORMATS ? format as keyof typeof EVENT_FORMATS : null };
}
export function parseOpportunityFilters(params: Record<string, string | string[] | undefined>) {
  const type = one(params.type);
  const q = (one(params.q) || "").normalize("NFC").trim().slice(0, 100).replace(/\p{C}/gu, "");
  return { type: type && (OPPORTUNITY_TYPES as readonly string[]).includes(type) ? type : null, q };
}

const dateTime = new Intl.DateTimeFormat("en-GB", { timeZone: COMMUNITY_TIME_ZONE, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const dateOnly = new Intl.DateTimeFormat("en-GB", { timeZone: COMMUNITY_TIME_ZONE, day: "numeric", month: "long", year: "numeric" });
const time = new Intl.DateTimeFormat("en-GB", { timeZone: COMMUNITY_TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false });
export function eventWhen(start: string | Date, end: string | Date) {
  const sameDay = dateOnly.format(new Date(start)) === dateOnly.format(new Date(end));
  return `${dateTime.format(new Date(start))} – ${sameDay ? time.format(new Date(end)) : dateTime.format(new Date(end))} EAT`;
}
export function formatDate(value: string | Date) { return dateOnly.format(new Date(value)); }
export function eventDay(value: string | Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: COMMUNITY_TIME_ZONE, day: "2-digit", month: "short" }).formatToParts(new Date(value));
  return { day: parts.find(part => part.type === "day")?.value || "", month: (parts.find(part => part.type === "month")?.value || "").toUpperCase() };
}
