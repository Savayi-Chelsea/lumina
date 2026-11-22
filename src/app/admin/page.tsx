import Link from "next/link";
import { pendingRequests } from "@/lib/verification";
import { communityCounts } from "@/lib/community";
import { jobFeedStatus } from "@/lib/job-feed";
import { systemHealth } from "@/lib/system-health";
import { HealthBadge } from "@/components/health-badge";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [requests, counts, health, feed] = await Promise.all([pendingRequests(), communityCounts(), systemHealth(), jobFeedStatus().catch(() => null)]);
  const lastUpdate = feed?.sources.map(source => source.last_success).filter((value): value is string => Boolean(value)).sort().at(-1);
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
      <section className="card"><h2>{feed ? `${feed.active.toLocaleString("en")} jobs in the feed` : "Jobs feed"}</h2>
        <p>{feed ? `Shown to alumni under Opportunities. ${lastUpdate ? `Last updated ${new Date(lastUpdate).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : "Not refreshed yet."}` : "Job feed status is unavailable."}</p>
        <Link className="button secondary" href="/admin/jobs">View jobs feed</Link>
      </section>
      <section className="card"><h2>System health</h2>
        <p><HealthBadge state={health.overall} /> {health.checks.filter(c => c.state !== "good").map(c => c.name.split(" (")[0]).join(", ") || "All services are working."}</p>
        <Link className="button secondary" href="/admin/health">View system health</Link>
      </section>
      <section className="card"><h2>Insight and accountability</h2>
        <p>Community analytics and mentor match quality, and the audit log of administrative actions.</p>
        <div className="actions"><Link className="button secondary" href="/admin/insights">Insights</Link><Link className="button secondary" href="/admin/audit">Audit log</Link></div>
      </section>
    </div>
  </>;
}
