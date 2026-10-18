import { demoEvents, demoOpportunities } from "@/lib/demo-community";
import { Icon } from "./icon";
import { PreviewDetails } from "./preview-details";

export function DemoLabel() { return <span className="demo-label">Demo preview</span>; }

export function EventCard({ event, index = 0 }: { event: typeof demoEvents[number]; index?: number }) {
  return <article className="event-card"><div className={`event-art event-art-${index % 3}`} aria-hidden="true"><span className="event-art-circle" /><Icon name={index === 0 ? "people" : index === 1 ? "compass" : "spark"} width={48} height={48} /><span>Let&apos;s gather.</span></div>
    <div className="event-body"><div className="card-meta"><span>{event.category}</span><span>Sample event</span></div><h3>{event.title}</h3><p className="location">{event.location}</p><p className="small muted">Illustrative event · Date to be confirmed</p>
      <PreviewDetails title={event.title} description={event.description} meta={event.category} label="Explore event" unavailable="This is an illustrative event, not a scheduled gathering. Dates and venues are unconfirmed. Registration and attendance booking are not available." />
    </div></article>;
}

export function OpportunityCard({ opportunity }: { opportunity: typeof demoOpportunities[number] }) {
  return <article className="opportunity-card"><span className="opportunity-icon"><Icon name="briefcase" width={25} height={25} /></span><div><div className="card-meta"><span>{opportunity.type}</span><span>Sample opportunity</span></div><h3>{opportunity.title}</h3><p>{opportunity.organization}</p><p className="location">{opportunity.location}</p><PreviewDetails title={opportunity.title} description={opportunity.description} meta={opportunity.type} label="Explore opportunity" unavailable="This listing is fictional and has no employer affiliation. Applications, referrals and saved opportunities are not available yet." /></div></article>;
}
