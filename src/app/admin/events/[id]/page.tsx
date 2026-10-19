import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { eventAttendees, getEvent } from "@/lib/community";
import { toEatInput } from "@/lib/community-input";
import { EventForm } from "@/components/admin-community-forms";
import { PublicationControls, StatusBadge } from "@/components/admin-community";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  const { id } = await params;
  const event = await getEvent(id, session.user.id, true);
  if (!event) notFound();
  const attendees = await eventAttendees(event.id);
  const { title, summary, description, category, format, location, capacity } = event;
  const initial = { id: event.id, title, summary, description, category, format, location, capacity, starts_at: toEatInput(event.starts_at), ends_at: toEatInput(event.ends_at) };
  return <>
    <p className="eyebrow">Administration / Events</p>
    <div className="admin-heading"><h1>Edit event</h1><StatusBadge status={event.status} /></div>
    <PublicationControls kind="events" id={event.id} status={event.status} edit={false} />
    <EventForm initial={initial} published={event.status === "published"} />
    <section className="card admin-attendees"><h2>Attendees ({attendees.length}{event.capacity !== null ? ` of ${event.capacity}` : ""})</h2>
      {attendees.length ? <ul>{attendees.map(person => <li key={person.email}><strong>{person.full_name || "Name not added"}</strong><span className="muted">{person.email}</span></li>)}</ul> : <p className="muted">No one has registered yet.</p>}
    </section>
  </>;
}
