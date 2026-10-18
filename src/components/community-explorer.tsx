"use client";

import { useState } from "react";
import { demoEvents, demoOpportunities } from "@/lib/demo-community";
import { DemoLabel, EventCard, OpportunityCard } from "./community-cards";
import { Icon } from "./icon";

export type CommunitySection = "events" | "opportunities";
const introductions = {
  events: { eyebrow: "LET’S MAKE NEW MEMORIES.", title: "There is always a reason to reconnect.", description: "Conversations, shared stories and a little time together. A look at what community gatherings could become.", note: "These are illustrative events, not scheduled gatherings. Dates and venues are unconfirmed. Registration and attendance booking are not open." },
  opportunities: { eyebrow: "THE NEXT CHAPTER STARTS WITH POSSIBILITY.", title: "Your experience belongs in new places.", description: "A new role, a shared purpose, a different direction. Imagine the possibilities beyond your last chapter.", note: "These are fictional opportunities from example organizations, not live vacancies or employer partnerships. Applications and referrals are not available." },
};

export function CommunityExplorer({ section }: { section: CommunitySection }) {
  const [filter, setFilter] = useState("All");
  const intro = introductions[section];
  const filters = section === "events" ? ["All", "In person", "Online"] : ["All", "Advisory", "Volunteer"];
  const events = demoEvents.filter(event => filter === "All" || event.format === filter);
  const opportunities = demoOpportunities.filter(opportunity => filter === "All" || opportunity.type === filter);
  const count = section === "events" ? events.length : opportunities.length;
  return <div className="explorer"><section className="explorer-intro"><p className="eyebrow">{intro.eyebrow}</p><h1>{intro.title}</h1><p>{intro.description}</p></section>
    <div className="preview-notice"><DemoLabel /><p>{intro.note}</p></div>
    <section className="explorer-results" aria-label={`${section} demonstration previews`}>
      <div className="filter-chips" role="group" aria-label="Filter previews by format">{filters.map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
      <p className="results-count" role="status" aria-live="polite">{count} {count === 1 ? "demo preview" : "demo previews"}{filter !== "All" ? ` · ${filter}` : ""}</p>
      {count === 0 ? <div className="empty-state"><Icon name="compass" width={32} height={32} /><h2>No previews found</h2><p>Try a different name or department, or clear your filters.</p><button className="secondary" type="button" onClick={() => { setFilter("All"); }}>Clear filters</button></div> :
          section === "events" ? <div className="event-grid">{events.map((event,index) => <EventCard event={event} index={index} key={event.id} />)}</div> : <div className="opportunity-list">{opportunities.map(opportunity => <OpportunityCard opportunity={opportunity} key={opportunity.id} />)}</div>}
    </section>
  </div>;
}
