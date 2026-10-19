import Link from "next/link";
import type { CommunityEvent, Opportunity } from "@/lib/community";
import { EVENT_FORMATS, WORK_MODES, eventDay, eventWhen, formatDate } from "@/lib/community-input";
import { Icon, type IconName } from "./icon";

const categoryIcon: Record<string, IconName> = { Reunion: "people", "Career conversation": "compass", "Mentorship circle": "spark", Workshop: "briefcase", Networking: "globe", "Community service": "people" };

/** Fictional demonstration rows are always labelled; admin-created listings are not. */
export function SampleLabel({ synthetic }: { synthetic: boolean }) {
  return synthetic ? <span className="demo-label" title="Fictional listing created for demonstration">Sample listing</span> : null;
}

export function placesLeft(event: Pick<CommunityEvent, "capacity" | "registration_count">) {
  return event.capacity === null ? null : Math.max(0, event.capacity - event.registration_count);
}

export function EventCard({ event, index = 0 }: { event: CommunityEvent; index?: number }) {
  const { day, month } = eventDay(event.starts_at);
  const left = placesLeft(event);
  return <article className="event-card live-event-card">
    <div className={`event-art event-art-${index % 3}`} aria-hidden="true"><span className="event-art-circle" /><span className="event-date-badge"><strong>{day}</strong>{month}</span><Icon name={categoryIcon[event.category] || "calendar"} width={44} height={44} /></div>
    <div className="event-body">
      <div className="card-meta"><span>{event.category}</span><span>{EVENT_FORMATS[event.format]}</span></div>
      <h3><Link href={`/events/${event.id}`}>{event.title}</Link></h3>
      <p className="event-when">{eventWhen(event.starts_at, event.ends_at)}</p>
      <p className="location">{event.location}</p>
      <p className="event-summary">{event.summary}</p>
      <div className="event-card-footer">
        {event.registered ? <span className="availability"><Icon name="check" width={12} height={12} />You&apos;re attending</span>
          : left === 0 ? <span className="badge">Fully booked</span>
          : <span className="small muted">{event.registration_count} attending{left !== null ? ` · ${left} places left` : ""}</span>}
        <SampleLabel synthetic={event.synthetic} />
      </div>
      <Link className="text-link" href={`/events/${event.id}`} aria-label={`View event: ${event.title}`}>View event<Icon name="arrow" /></Link>
    </div>
  </article>;
}

export function OpportunityCard({ opportunity }: { opportunity: Opportunity }) {
  return <article className="opportunity-card">
    <span className="opportunity-icon"><Icon name="briefcase" width={25} height={25} /></span>
    <div>
      <div className="card-meta"><span>{opportunity.opportunity_type}</span><span>{WORK_MODES[opportunity.work_mode]}</span></div>
      <h3><Link href={`/opportunities/${opportunity.id}`}>{opportunity.title}</Link></h3>
      <p>{opportunity.organization}</p>
      <p className="location">{opportunity.location}</p>
      <p className="opportunity-summary">{opportunity.summary}</p>
      <div className="event-card-footer">
        <span className="small muted">{opportunity.closes_on ? `Closes ${formatDate(opportunity.closes_on)}` : "Open until filled"}</span>
        <SampleLabel synthetic={opportunity.synthetic} />
      </div>
      <Link className="text-link" href={`/opportunities/${opportunity.id}`} aria-label={`View opportunity: ${opportunity.title}`}>View details<Icon name="arrow" /></Link>
    </div>
  </article>;
}
