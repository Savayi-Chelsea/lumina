import { requireAdmin } from "@/lib/session";
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

/** Members see these listings under Opportunities; this page shows where they come from and can refresh them. */
export default async function AdminJobsPage({ searchParams }: { searchParams: Promise<{ jobs?: string }> }) {
  await requireAdmin();
  const [{ jobs: outcome }, feed] = await Promise.all([searchParams, jobFeedStatus().catch(() => null)]);
  return <>
    <p className="eyebrow">Administration / Jobs feed</p>
    <div className="admin-heading"><h1>Jobs feed</h1><form action={refreshJobsNow}><button type="submit" className="button secondary">Refresh now</button></form></div>
    <p>Real listings from external job boards, refreshed automatically once a day and shown to verified alumni under Opportunities. Lumina stores plain-text copies, links every Apply to the original listing and removes expired jobs.</p>
    {outcome && JOB_OUTCOMES[outcome] && <p className="card notice" role="status">{JOB_OUTCOMES[outcome]}</p>}
    <section className="card job-feed-admin" aria-labelledby="job-feed-heading">
      <h2 id="job-feed-heading">Sources{feed ? ` · ${feed.active} live ${feed.active === 1 ? "listing" : "listings"}` : ""}</h2>
      {feed ? <ul className="job-feed-sources">{feed.sources.map(source => <li key={source.source}>
        <strong>{source.label}</strong>{" "}
        {source.enabled ? <span>{source.active} live listing{source.active === 1 ? "" : "s"} · updated {nairobiTime(source.last_success)}{source.last_status === "failed" ? ` · last attempt failed (${source.last_error ?? "unknown"})` : source.last_error ? ` · ${source.last_error}` : ""}</span>
          : <span className="muted">Off. {source.source === "jsearch" ? "Set JSEARCH_API_KEY (RapidAPI, free plan 200 requests a month) to add on-site jobs in Kenya from LinkedIn, BrighterMonday and other boards." : source.source === "jobwebkenya" ? "Enabled unless JOB_FEED_JOBWEBKENYA=off." : "Enabled unless JOB_FEED_HIMALAYAS=off."}</span>}
      </li>)}</ul> : <p className="muted">Job feed status is unavailable. Is migration 009 applied?</p>}
    </section>
  </>;
}
