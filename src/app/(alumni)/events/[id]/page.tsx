import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { getEvent } from "@/lib/community";
import { EVENT_FORMATS, eventDay, eventWhen } from "@/lib/community-input";
import { placesLeft } from "@/components/community-cards";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";
import { changeRegistration } from "../actions";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  registered: "You're attending. We've saved your place.",
  already: "You're already attending this event.",
  cancelled: "Your registration has been cancelled.",
  full: "Sorry, this event is fully booked.",
  closed: "Registration is closed for this event.",
  not_registered: "You weren't registered for this event.",
  failed: "We couldn't update your registration. Please try again.",
};

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rsvp?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to join community events." area="Events are" />;
  const [{ id }, { rsvp }] = await Promise.all([params, searchParams]);
  const event = await getEvent(id, session.user.id, session.user.role === "admin");
  if (!event) notFound();
  const left = placesLeft(event);
  const upcoming = new Date(event.starts_at) > new Date();
  const { day, month } = eventDay(event.starts_at);
  const message = rsvp ? messages[rsvp] : undefined;
  return <article className="community-detail">
    <Link className="text-link back-link" href="/events"><Icon name="arrow" className="flip" />All events</Link>
    {event.status !== "published" && <p className="card notice" role="status">Admin preview · This event is {event.status} and not visible to alumni.</p>}
    <header className="community-detail-hero">
      <span className="event-date-badge large"><strong>{day}</strong>{month}</span>
      <div><p className="eyebrow">{event.category} · {EVENT_FORMATS[event.format]}</p><h1>{event.title}</h1><p className="detail-summary">{event.summary}</p></div>
    </header>
    <div className="community-detail-grid">
      <section className="card"><h2>About this event</h2><p className="detail-description">{event.description}</p></section>
      <aside className="card rsvp-card" aria-label="Registration">
        <dl><dt>When</dt><dd>{eventWhen(event.starts_at, event.ends_at)}</dd><dt>Where</dt><dd>{event.location}</dd><dt>Attending</dt><dd>{event.registration_count}{event.capacity !== null ? ` of ${event.capacity}` : ""}</dd></dl>
        {message && <p className={rsvp === "registered" || rsvp === "cancelled" ? "auth-notice" : "auth-feedback"} role="status">{message}</p>}
        {!upcoming ? <p className="muted">This event has already taken place.</p>
          : event.status !== "published" ? null
          : <form action={changeRegistration}>
              <input type="hidden" name="event_id" value={event.id} />
              {event.registered ? <><p className="availability"><Icon name="check" width={12} height={12} />You&apos;re attending</p><button className="secondary" name="intent" value="cancel">Cancel my registration</button></>
                : left === 0 ? <p className="badge">Fully booked</p>
                : <button name="intent" value="register">Reserve my place</button>}
            </form>}
        {left !== null && left > 0 && upcoming && <p className="small muted">{left} {left === 1 ? "place" : "places"} left</p>}
      </aside>
    </div>
  </article>;
}
