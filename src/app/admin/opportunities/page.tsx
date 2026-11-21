import Link from "next/link";
import { adminOpportunities } from "@/lib/community";
import { formatDate } from "@/lib/community-input";
import { AdminNotice, PublicationControls, StatusBadge } from "@/components/admin-community";
import { jobFeedStatus } from "@/lib/job-feed";
import { refreshJobsNow } from "@/app/admin/job-feed-actions";

const JOB_OUTCOMES: Record<string, string> = {
  started: "Refresh started. New listings appear within about a minute; reload this page to see each source's status.",
  refreshed: "Job feed refreshed.",
  partial: "Job feed refreshed, but some requests failed; see the source status below.",
  failed: "The job sources could not be reached. Existing listings stay visible; try again later.",
  busy: "A refresh is already running. Reload in a moment.",
  off: "No job source is enabled.",
};
const nairobiTime = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

export const dynamic = "force-dynamic";

export default async function AdminOpportunitiesPage({ searchParams }: { searchParams: Promise<{ saved?: string; status?: string; jobs?: string }> }) {
  const [opportunities, { jobs: jobsOutcome, ...notice }, feed] = await Promise.all([adminOpportunities(), searchParams, jobFeedStatus().catch(() => null)]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  return <>
    <p className="eyebrow">Administration / Opportunities</p>
    <div className="admin-heading"><h1>Opportunities</h1><Link className="button" href="/admin/opportunities/new">Create opportunity</Link></div>
    <p>Published listings appear to verified alumni until their closing date. Drafts and archived listings stay hidden.</p>
    <AdminNotice {...notice} />
    <section className="card job-feed-admin" aria-labelledby="job-feed-heading">
      <div className="admin-heading"><h2 id="job-feed-heading">Kenya job feed</h2><form action={refreshJobsNow}><button type="submit" className="button secondary">Refresh now</button></form></div>
      <p className="small">Real listings from external job boards, refreshed automatically once a day and shown to verified alumni under Opportunities › Jobs in Kenya. Lumina stores plain-text copies, links every Apply to the original listing and removes expired jobs.</p>
      {jobsOutcome && JOB_OUTCOMES[jobsOutcome] && <p className="card notice" role="status">{JOB_OUTCOMES[jobsOutcome]}</p>}
      {feed ? <ul className="job-feed-sources">{feed.sources.map(source => <li key={source.source}>
        <strong>{source.label}</strong>{" "}
        {source.enabled ? <span>{source.active} live listing{source.active === 1 ? "" : "s"} · updated {nairobiTime(source.last_success)}{source.last_status === "failed" ? ` · last attempt failed (${source.last_error ?? "unknown"})` : source.last_error ? ` · ${source.last_error}` : ""}</span>
          : <span className="muted">Off. {source.source === "jsearch" ? "Set JSEARCH_API_KEY (RapidAPI, free plan 200 requests a month) to add on-site jobs in Kenya from LinkedIn, BrighterMonday and other boards." : source.source === "jobwebkenya" ? "Enabled unless JOB_FEED_JOBWEBKENYA=off." : "Enabled unless JOB_FEED_HIMALAYAS=off."}</span>}
      </li>)}</ul> : <p className="muted">Job feed status is unavailable. Is migration 009 applied?</p>}
    </section>
    {!opportunities.length ? <section className="card"><h2>No opportunities yet</h2><p>Share the first role, advisory position or volunteering opportunity.</p></section>
      : <div className="admin-list">{opportunities.map(item => <article className="card admin-item" key={item.id}>
          <div className="admin-item-heading"><h2><Link href={`/opportunities/${item.id}`}>{item.title}</Link></h2><div className="mentor-labels"><StatusBadge status={item.status} />{item.closes_on && item.closes_on < today && <span className="badge">Closed</span>}</div></div>
          <p className="muted">{item.opportunity_type} · {item.organization} · {item.location}</p>
          <p className="small">{item.closes_on ? `Closes ${formatDate(item.closes_on)}` : "Open until filled"} · <Link href={`/admin/opportunities/${item.id}#applicants`}>{item.applicant_count ?? 0} applicant{item.applicant_count === 1 ? "" : "s"}</Link></p>
          <PublicationControls kind="opportunities" id={item.id} status={item.status} />
        </article>)}</div>}
  </>;
}
