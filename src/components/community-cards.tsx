import type { DemoPerson } from "@/lib/demo-community";
import { demoEvents, demoOpportunities } from "@/lib/demo-community";
import { Icon } from "./icon";
import { PreviewDetails } from "./preview-details";

export function DemoLabel() { return <span className="demo-label">Demo preview</span>; }

export function PersonCard({ person, mentor = false }: { person: DemoPerson; mentor?: boolean }) {
  return <article className={`person-card${mentor ? " mentor-card" : ""}`}>
    <div className={`person-cover tone-${person.tone}`}><span className="cover-orbit" aria-hidden="true" /><span className="person-avatar" aria-hidden="true">{person.initials}</span><span className="sample-tag">Fictional profile</span></div>
    <div className="person-body"><p className="eyebrow">{person.department}</p><h3>{person.name}</h3><p className="person-role">{person.role}</p><p className="location"><Icon name="globe" />{person.location}</p>
      {mentor && <div className="tags">{person.topics.map(topic => <span key={topic}>{topic}</span>)}</div>}
      <PreviewDetails title={person.name} description={person.story} meta={person.department} label={mentor ? "Meet this mentor" : "View profile preview"} unavailable="This is a fictional profile used to preview the community. Connections, messaging and mentor requests are not available yet. This is not a live recommendation or a semantic matching result." />
    </div>
  </article>;
}

export function EventCard({ event, index = 0 }: { event: typeof demoEvents[number]; index?: number }) {
  return <article className="event-card"><div className={`event-art event-art-${index % 3}`} aria-hidden="true"><span className="event-art-circle" /><Icon name={index === 0 ? "people" : index === 1 ? "compass" : "spark"} width={48} height={48} /><span>Let&apos;s gather.</span></div>
    <div className="event-body"><div className="card-meta"><span>{event.category}</span><span>Sample event</span></div><h3>{event.title}</h3><p className="location">{event.location}</p><p className="small muted">Illustrative event · Date to be confirmed</p>
      <PreviewDetails title={event.title} description={event.description} meta={event.category} label="Explore event" unavailable="This is an illustrative event, not a scheduled gathering. Dates and venues are unconfirmed. Registration and attendance booking are not available." />
    </div></article>;
}

export function OpportunityCard({ opportunity }: { opportunity: typeof demoOpportunities[number] }) {
  return <article className="opportunity-card"><span className="opportunity-icon"><Icon name="briefcase" width={25} height={25} /></span><div><div className="card-meta"><span>{opportunity.type}</span><span>Sample opportunity</span></div><h3>{opportunity.title}</h3><p>{opportunity.organization}</p><p className="location">{opportunity.location}</p><PreviewDetails title={opportunity.title} description={opportunity.description} meta={opportunity.type} label="Explore opportunity" unavailable="This listing is fictional and has no employer affiliation. Applications, referrals and saved opportunities are not available yet." /></div></article>;
}
