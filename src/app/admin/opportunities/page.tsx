import Link from "next/link";
import { adminOpportunities } from "@/lib/community";
import { formatDate } from "@/lib/community-input";
import { AdminNotice, PublicationControls, StatusBadge } from "@/components/admin-community";

export const dynamic = "force-dynamic";

export default async function AdminOpportunitiesPage({ searchParams }: { searchParams: Promise<{ saved?: string; status?: string }> }) {
  const [opportunities, notice] = await Promise.all([adminOpportunities(), searchParams]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  return <>
    <p className="eyebrow">Administration / Opportunities</p>
    <div className="admin-heading"><h1>Opportunities</h1><Link className="button" href="/admin/opportunities/new">Create opportunity</Link></div>
    <p>Published listings appear to verified alumni until their closing date. Drafts and archived listings stay hidden.</p>
    <AdminNotice {...notice} />
    {!opportunities.length ? <section className="card"><h2>No opportunities yet</h2><p>Share the first role, advisory position or volunteering opportunity.</p></section>
      : <div className="admin-list">{opportunities.map(item => <article className="card admin-item" key={item.id}>
          <div className="admin-item-heading"><h2><Link href={`/opportunities/${item.id}`}>{item.title}</Link></h2><div className="mentor-labels"><StatusBadge status={item.status} />{item.closes_on && item.closes_on < today && <span className="badge">Closed</span>}</div></div>
          <p className="muted">{item.opportunity_type} · {item.organization} · {item.location}</p>
          <p className="small">{item.closes_on ? `Closes ${formatDate(item.closes_on)}` : "Open until filled"}</p>
          <PublicationControls kind="opportunities" id={item.id} status={item.status} />
        </article>)}</div>}
  </>;
}
