import Link from "next/link";
import { pendingRequests } from "@/lib/verification";
import { communityCounts } from "@/lib/community";
import { systemHealth } from "@/lib/system-health";
import { HealthBadge } from "@/components/health-badge";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [requests, counts, health] = await Promise.all([pendingRequests(), communityCounts(), systemHealth()]);
  return <>
    <p className="eyebrow">Lumina administration</p><h1>Community stewardship</h1>
    <div className="admin-stats">
      <section className="card"><h2>{requests.length} open verification exceptions</h2>
        <p>Alumni verification runs automatically against the alumni registry. Administrators assist only when a user requests help.</p>
        <Link className="button" href="/admin/verification">Review assistance requests</Link>
      </section>
      <section className="card"><h2>{counts.upcoming_events} upcoming events</h2>
        <p>{counts.registrations} {counts.registrations === 1 ? "place" : "places"} reserved by alumni.</p>
        <Link className="button secondary" href="/admin/events">Manage events</Link>
      </section>
      <section className="card"><h2>{counts.open_opportunities} open opportunities</h2>
        <p>{counts.drafts} {counts.drafts === 1 ? "draft" : "drafts"} across events and opportunities.</p>
        <Link className="button secondary" href="/admin/opportunities">Manage opportunities</Link>
      </section>
      <section className="card"><h2>System health</h2>
        <p><HealthBadge state={health.overall} /> {health.checks.filter(c => c.state !== "good").map(c => c.name.split(" (")[0]).join(", ") || "All services are working."}</p>
        <Link className="button secondary" href="/admin/health">View system health</Link>
      </section>
      <section className="card"><h2>Insight and accountability</h2>
        <p>Community analytics, mentor match quality and the audit log of administrative actions.</p>
        <div className="actions"><Link className="button secondary" href="/admin/analytics">Analytics</Link><Link className="button secondary" href="/admin/matching">Match quality</Link><Link className="button secondary" href="/admin/audit">Audit log</Link></div>
      </section>
    </div>
  </>;
}
