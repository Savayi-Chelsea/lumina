"use client";

import { useState } from "react";
import { demoEvents, demoOpportunities, demoPeople } from "@/lib/demo-community";
import { DemoLabel, EventCard, OpportunityCard, PersonCard } from "./community-cards";
import { Icon } from "./icon";

export type CommunitySection = "network" | "events" | "opportunities";
const introductions = {
  network: { eyebrow: "FAMILIAR PEOPLE. NEW CONNECTIONS.", title: "A world of shared experience.", description: "From the flight deck to finance, the cabin to the cloud. Explore the many chapters of our community.", note: "These are fictional alumni profiles for demonstration. This directory is not connected to live members; connections and messaging are not available." },
  events: { eyebrow: "LET’S MAKE NEW MEMORIES.", title: "There is always a reason to reconnect.", description: "Conversations, shared stories and a little time together. A look at what community gatherings could become.", note: "These are illustrative events, not scheduled gatherings. Dates and venues are unconfirmed. Registration and attendance booking are not open." },
  opportunities: { eyebrow: "THE NEXT CHAPTER STARTS WITH POSSIBILITY.", title: "Your experience belongs in new places.", description: "A new role, a shared purpose, a different direction. Imagine the possibilities beyond your last chapter.", note: "These are fictional opportunities from example organizations, not live vacancies or employer partnerships. Applications and referrals are not available." },
};

export function CommunityExplorer({ section }: { section: CommunitySection }) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const intro = introductions[section];
  const filters = section === "network" ? ["All", ...new Set(demoPeople.map(person => person.department))] : section === "events" ? ["All", "In person", "Online"] : ["All", "Advisory", "Volunteer"];
  const people = demoPeople.filter(person => (filter === "All" || person.department === filter) && `${person.name} ${person.role} ${person.department} ${person.location}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const events = demoEvents.filter(event => filter === "All" || event.format === filter);
  const opportunities = demoOpportunities.filter(opportunity => filter === "All" || opportunity.type === filter);
  const count = section === "events" ? events.length : section === "opportunities" ? opportunities.length : people.length;
  return <div className="explorer"><section className="explorer-intro"><p className="eyebrow">{intro.eyebrow}</p><h1>{intro.title}</h1><p>{intro.description}</p></section>
    <div className="preview-notice"><DemoLabel /><p>{intro.note}</p></div>
    <section className="explorer-results" aria-label={`${section} demonstration previews`}>
      {section === "network" && <div className="directory-search"><label htmlFor="directory-search">Find a fictional profile</label><input id="directory-search" type="search" placeholder="Try a name, department or city" value={query} onChange={event => setQuery(event.target.value)} /><p className="small muted">Filters the six demonstration profiles on this page.</p></div>}
      <div className="filter-chips" role="group" aria-label={section === "network" ? "Filter by department" : "Filter previews by format"}>{filters.map(value => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
      <p className="results-count" role="status" aria-live="polite">{count} {count === 1 ? "demo preview" : "demo previews"}{filter !== "All" ? ` · ${filter}` : ""}</p>
      {count === 0 ? <div className="empty-state"><Icon name="compass" width={32} height={32} /><h2>No previews found</h2><p>Try a different name or department, or clear your filters.</p><button className="secondary" type="button" onClick={() => { setFilter("All"); setQuery(""); }}>Clear filters</button></div> :
        section === "network" ? <div className="people-grid">{people.map(person => <PersonCard person={person} key={person.id} />)}</div> :
          section === "events" ? <div className="event-grid">{events.map((event,index) => <EventCard event={event} index={index} key={event.id} />)}</div> : <div className="opportunity-list">{opportunities.map(opportunity => <OpportunityCard opportunity={opportunity} key={opportunity.id} />)}</div>}
    </section>
  </div>;
}
