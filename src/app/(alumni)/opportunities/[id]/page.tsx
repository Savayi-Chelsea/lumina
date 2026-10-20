import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { getOpportunity } from "@/lib/community";
import { WORK_MODES, formatDate } from "@/lib/community-input";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to explore opportunities." area="Opportunities are" />;
  const { id } = await params;
  const opportunity = await getOpportunity(id, session.user.role === "admin");
  if (!opportunity) notFound();
  return <article className="community-detail">
    <Link className="text-link back-link" href="/opportunities"><Icon name="arrow" className="flip" />All opportunities</Link>
    {opportunity.status !== "published" && <p className="card notice" role="status">Admin preview · This listing is {opportunity.status} and not visible to alumni.</p>}
    <header className="community-detail-hero">
      <span className="opportunity-icon large"><Icon name="briefcase" width={32} height={32} /></span>
      <div><p className="eyebrow">{opportunity.opportunity_type} · {WORK_MODES[opportunity.work_mode]}</p><h1>{opportunity.title}</h1><p className="detail-summary">{opportunity.organization} · {opportunity.location}</p></div>
    </header>
    <div className="community-detail-grid">
      <section className="card"><h2>About the opportunity</h2><p className="detail-summary">{opportunity.summary}</p><p className="detail-description">{opportunity.description}</p></section>
      <aside className="card rsvp-card" aria-label="How to apply">
        <dl><dt>Organization</dt><dd>{opportunity.organization}</dd>{opportunity.industry && <><dt>Industry</dt><dd>{opportunity.industry}</dd></>}<dt>Closes</dt><dd>{opportunity.closes_on ? formatDate(opportunity.closes_on) : "Open until filled"}</dd></dl>
        <h2>How to apply</h2><p className="detail-description">{opportunity.how_to_apply}</p>
      </aside>
    </div>
  </article>;
}
