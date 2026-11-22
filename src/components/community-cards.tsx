import Link from "next/link";
import type { CommunityEvent } from "@/lib/community";
import { EVENT_FORMATS, eventDay, eventWhen } from "@/lib/community-input";
import { Icon, type IconName } from "./icon";

const categoryIcon: Record<string, IconName> = { Reunion: "people", "Career conversation": "compass", "Mentorship circle": "spark", Workshop: "briefcase", Networking: "globe", "Community service": "people" };

export function placesLeft(event: Pick<CommunityEvent, "capacity" | "registration_count">) {
  return event.capacity === null ? null : Math.max(0, event.capacity - event.registration_count);
}

export function EventCard({ event, index = 0 }: { event: CommunityEvent; index?: number }) {
  const { day, month } = eventDay(event.starts_at);
  const left = placesLeft(event);
  const past = new Date(event.ends_at) < new Date();
  return <article className="event-card live-event-card">
    <div className={`event-art event-art-${index % 3}`} aria-hidden="true"><span className="event-art-circle" /><span className="event-date-badge"><strong>{day}</strong>{month}</span><Icon name={categoryIcon[event.category] || "calendar"} width={44} height={44} /></div>
    <div className="event-body">
      <div className="card-meta"><span>{event.category}</span><span>{EVENT_FORMATS[event.format]}</span></div>
      <h3><Link href={`/events/${event.id}`}>{event.title}</Link></h3>
      <p className="event-when">{eventWhen(event.starts_at, event.ends_at)}</p>
      <p className="location">{event.location}</p>
      <p className="event-summary">{event.summary}</p>
      <div className="event-card-footer">
        {past ? <span className="small muted">{event.registered ? "You attended · " : ""}{event.registration_count} attended</span>
          : event.registered ? <span className="availability"><Icon name="check" width={12} height={12} />You&apos;re attending</span>
          : left === 0 ? <span className="badge">Fully booked</span>
          : <span className="small muted">{event.registration_count} attending{left !== null ? ` · ${left} places left` : ""}</span>}
      </div>
      <Link className="text-link" href={`/events/${event.id}`} aria-label={`View event: ${event.title}`}>View event<Icon name="arrow" /></Link>
    </div>
  </article>;
}
