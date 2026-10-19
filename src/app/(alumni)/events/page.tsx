import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { listEvents } from "@/lib/community";
import { EVENT_FORMATS, parseEventFilters } from "@/lib/community-input";
import { EventCard } from "@/components/community-cards";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default async function EventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to join community events." area="Events are" />;
  const filters = parseEventFilters(await searchParams);
  const events = await listEvents(session.user.id, filters);
  const href = (view: string, format: string | null) => {
    const params = new URLSearchParams();
    if (view === "past") params.set("view", "past");
    if (format) params.set("format", format);
    return `/events${params.size ? `?${params}` : ""}`;
  };
  return <div className="explorer">
    <section className="explorer-intro"><p className="eyebrow">LET’S MAKE NEW MEMORIES.</p><h1>There is always a reason to reconnect.</h1><p>Reunions, career conversations and mentorship circles hosted for the Lumina community. Reserve your place in a click.</p></section>
    <nav className="filter-chips" aria-label="Event timing">{(["upcoming", "past"] as const).map(view => <Link key={view} className={`chip${filters.view === view ? " chip-active" : ""}`} aria-current={filters.view === view ? "page" : undefined} href={href(view, filters.format)}>{view === "upcoming" ? "Upcoming" : "Past events"}</Link>)}</nav>
    <nav className="filter-chips" aria-label="Event format">{[null, ...Object.keys(EVENT_FORMATS)].map(format => <Link key={format || "all"} className={`chip${filters.format === format ? " chip-active" : ""}`} aria-current={filters.format === format ? "page" : undefined} href={href(filters.view, format)}>{format ? EVENT_FORMATS[format as keyof typeof EVENT_FORMATS] : "All formats"}</Link>)}</nav>
    <p className="results-count" role="status">{events.length} {filters.view === "past" ? "past" : "upcoming"} {events.length === 1 ? "event" : "events"}{filters.format ? ` · ${EVENT_FORMATS[filters.format]}` : ""}</p>
    {events.length ? <div className="event-grid">{events.map((event, index) => <EventCard key={event.id} event={event} index={index} />)}</div>
      : <div className="empty-state"><Icon name="calendar" width={32} height={32} /><h2>No events here yet</h2><p>{filters.view === "past" ? "Past gatherings will appear here." : "New gatherings are announced regularly. Check back soon."}</p>{filters.format && <Link className="button secondary" href={href(filters.view, null)}>Show all formats</Link>}</div>}
  </div>;
}
