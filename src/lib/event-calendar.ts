import "server-only";
import { applicationOrigin } from "@/lib/application-origin";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar-links";
import type { CommunityEvent } from "@/lib/community";

/** Calendar text for a community event, with a link back to its Lumina page when the origin is configured. */
export function eventCalendarDetails(event: Pick<CommunityEvent, "id" | "title" | "summary" | "location" | "starts_at" | "ends_at">) {
  let url: string | null = null;
  try { url = `${applicationOrigin()}/events/${event.id}`; } catch { url = null; }
  const title = `${event.title} (Lumina)`;
  const details = `${event.summary}${url ? `\n\nEvent details: ${url}` : ""}`;
  const link = { title, start: new Date(event.starts_at), end: new Date(event.ends_at), details, location: event.location };
  return { title, details, url, google: googleCalendarUrl(link), outlook: outlookCalendarUrl(link), ics: `/api/events/${event.id}/ics` };
}
