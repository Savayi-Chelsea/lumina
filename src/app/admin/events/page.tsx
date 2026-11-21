import Link from "next/link";
import { adminEvents } from "@/lib/community";
import { eventWhen } from "@/lib/community-input";
import { AdminNotice, PublicationControls, StatusBadge } from "@/components/admin-community";

export const dynamic = "force-dynamic";

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ saved?: string; status?: string }> }) {
  const [events, notice] = await Promise.all([adminEvents(), searchParams]);
  const now = new Date();
  return <>
    <p className="eyebrow">Administration / Events</p>
    <div className="admin-heading"><h1>Events</h1><Link className="button" href="/admin/events/new">Create event</Link></div>
    <p>Published upcoming events appear to verified alumni, who can reserve a place. Drafts and archived events stay hidden.</p>
    <AdminNotice {...notice} />
    {!events.length ? <section className="card"><h2>No events yet</h2><p>Create the first gathering for the community.</p></section>
      : <div className="admin-list">{events.map(event => <article className="card admin-item" key={event.id}>
          <div className="admin-item-heading"><h2><Link href={`/events/${event.id}`}>{event.title}</Link></h2><div className="mentor-labels"><StatusBadge status={event.status} />{new Date(event.ends_at) < now && <span className="badge">Past</span>}</div></div>
          <p className="muted">{event.category} · {eventWhen(event.starts_at, event.ends_at)} · {event.location}</p>
          <p className="small">{event.registration_count} registered{event.capacity !== null ? ` of ${event.capacity}` : ""}</p>
          <PublicationControls kind="events" id={event.id} status={event.status} />
        </article>)}</div>}
  </>;
}
