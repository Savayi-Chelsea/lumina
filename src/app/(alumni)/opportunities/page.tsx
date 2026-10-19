import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { listOpportunities } from "@/lib/community";
import { OPPORTUNITY_TYPES, parseOpportunityFilters } from "@/lib/community-input";
import { OpportunityCard } from "@/components/community-cards";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to explore opportunities." area="Opportunities are" />;
  const filters = parseOpportunityFilters(await searchParams);
  const opportunities = await listOpportunities(filters);
  const href = (type: string | null) => {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (type) params.set("type", type);
    return `/opportunities${params.size ? `?${params}` : ""}`;
  };
  return <div className="explorer">
    <section className="explorer-intro"><p className="eyebrow">THE NEXT CHAPTER STARTS WITH POSSIBILITY.</p><h1>Your experience belongs in new places.</h1><p>Roles, advisory work and volunteering shared with the Lumina community. Each listing explains how to apply.</p></section>
    <form action="/opportunities" method="get" className="opportunity-search" role="search">
      {filters.type && <input type="hidden" name="type" value={filters.type} />}
      <div className="field"><label htmlFor="opportunity-q">Search opportunities</label><input id="opportunity-q" type="search" name="q" maxLength={100} defaultValue={filters.q} placeholder="Title, organization, industry or location" /></div>
      <button type="submit">Search</button>
    </form>
    <nav className="filter-chips" aria-label="Opportunity type">{[null, ...OPPORTUNITY_TYPES].map(type => <Link key={type || "all"} className={`chip${filters.type === type ? " chip-active" : ""}`} aria-current={filters.type === type ? "page" : undefined} href={href(type)}>{type || "All types"}</Link>)}</nav>
    <p className="results-count" role="status">{opportunities.length} open {opportunities.length === 1 ? "opportunity" : "opportunities"}{filters.type ? ` · ${filters.type}` : ""}{filters.q ? ` matching “${filters.q}”` : ""}</p>
    {opportunities.length ? <div className="opportunity-grid">{opportunities.map(opportunity => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}</div>
      : <div className="empty-state"><Icon name="briefcase" width={32} height={32} /><h2>No open opportunities found</h2><p>Try a different search or type, or check back soon.</p><Link className="button secondary" href="/opportunities">Clear filters</Link></div>}
  </div>;
}
