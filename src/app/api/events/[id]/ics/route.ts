import { currentSession } from "@/lib/session";
import { buildIcs } from "@/lib/ics";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { getEvent } from "@/lib/community";
import { eventCalendarDetails } from "@/lib/event-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** "Add to calendar" (.ics) for a published community event, for members who can see events. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentSession();
  if (!auth?.user) return new Response("Sign in first.", { status: 401, headers: noStore });
  if (!canDiscoverMentors(auth.user)) return new Response("Complete verification first.", { status: 403, headers: noStore });
  const event = await getEvent((await params).id, auth.user.id);
  if (!event) return new Response("Event not found.", { status: 404, headers: noStore });
  const details = eventCalendarDetails(event);
  const ics = buildIcs({
    uid: `event-${event.id}`, start: new Date(event.starts_at), end: new Date(event.ends_at), method: "PUBLISH",
    product: "Community events", summary: details.title, description: details.details, location: event.location,
    url: details.url, alarm: `${event.title} starts in 30 minutes`,
  });
  return new Response(ics, { headers: {
    "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="lumina-event.ics"',
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
