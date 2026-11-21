import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { getProfile } from "@/lib/profiles";
import { jobFeedStatus, JOBS_PER_PAGE, listExternalJobs, parseJobFilters, scheduleJobFeedRefresh, type JobFilters } from "@/lib/job-feed";
import { JOB_TOPICS, topicsForDepartment } from "@/lib/job-sources";

const SOURCE_SITES: Partial<Record<string, string>> = { himalayas: "https://himalayas.app", jobwebkenya: "https://jobwebkenya.com" };
import { JobCard, OpportunityTabs } from "@/components/job-card";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

const updatedLabel = (value: string | null) => value
  ? new Date(value).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  : null;

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to explore jobs." area="Jobs are" />;
  // Never make a visitor wait for a provider: a stale feed refreshes after this response.
  scheduleJobFeedRefresh();
  const filters = parseJobFilters(await searchParams);
  const profile = session.user.role === "admin" ? null : await getProfile(session.user.id);
  const memberTopics = topicsForDepartment(profile?.former_kq_department);
  if (filters.topic === "for-you" && !memberTopics.length) filters.topic = null;
  const [{ jobs, more }, status] = await Promise.all([listExternalJobs(filters, memberTopics), jobFeedStatus()]);
  const href = (change: Partial<JobFilters>) => {
    const next = { ...filters, page: 1, ...change };
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.topic) params.set("topic", next.topic);
    if (next.mode) params.set("mode", next.mode);
    if (next.page > 1) params.set("page", String(next.page));
    return `/opportunities/jobs${params.size ? `?${params}` : ""}`;
  };
  const enabled = status.sources.filter(source => source.enabled);
  const lastUpdate = enabled.map(source => source.last_success).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const topicLabel = filters.topic === "for-you" ? "recommended for you" : JOB_TOPICS.find(topic => topic.id === filters.topic)?.label;
  const department = profile?.former_kq_department;

  return <div className="explorer">
    <section className="explorer-intro">
      <p className="eyebrow">LIVE LISTINGS · UPDATED DAILY</p>
      <h1>Jobs open to you in Kenya.</h1>
      <p>Real openings from job boards, matched to the careers Kenya Airways alumni move into. Applications go straight to the original listing.</p>
    </section>
    <OpportunityTabs active="jobs" jobCount={status.active} />
    <form action="/opportunities/jobs" method="get" className="opportunity-search" role="search">
      {filters.topic && <input type="hidden" name="topic" value={filters.topic} />}
      {filters.mode && <input type="hidden" name="mode" value={filters.mode} />}
      <div className="field"><label htmlFor="job-q">Search jobs</label><input id="job-q" type="search" name="q" maxLength={100} defaultValue={filters.q} placeholder="Title, company, skill or location" /></div>
      <button type="submit">Search</button>
    </form>
    <nav className="filter-chips" aria-label="Career area">
      {memberTopics.length > 0 && <Link className={`chip${filters.topic === "for-you" ? " chip-active" : ""}`} aria-current={filters.topic === "for-you" ? "page" : undefined} href={href({ topic: "for-you" })}>For you</Link>}
      <Link className={`chip${filters.topic === null ? " chip-active" : ""}`} aria-current={filters.topic === null ? "page" : undefined} href={href({ topic: null })}>All jobs</Link>
      {JOB_TOPICS.map(topic => <Link key={topic.id} className={`chip${filters.topic === topic.id ? " chip-active" : ""}`} aria-current={filters.topic === topic.id ? "page" : undefined} href={href({ topic: topic.id })}>{topic.label}</Link>)}
    </nav>
    <nav className="filter-chips" aria-label="Work arrangement">
      {([[null, "Any arrangement"], ["remote", "Remote"], ["on_site", "On-site in Kenya"]] as const).map(([mode, label]) =>
        <Link key={label} className={`chip${filters.mode === mode ? " chip-active" : ""}`} aria-current={filters.mode === mode ? "page" : undefined} href={href({ mode })}>{label}</Link>)}
    </nav>
    {department && filters.topic !== "for-you" && memberTopics.length > 0 && <p className="small muted job-hint">Listings marked <strong>For you</strong> suit people who worked in {department}.</p>}
    <p className="results-count" role="status">
      {jobs.length ? `Showing ${(filters.page - 1) * JOBS_PER_PAGE + 1}–${(filters.page - 1) * JOBS_PER_PAGE + jobs.length}${more ? "+" : ""}` : "No"} {jobs.length === 1 ? "job" : "jobs"}
      {topicLabel ? ` · ${topicLabel}` : ""}{filters.mode ? ` · ${filters.mode === "remote" ? "remote" : "on-site"}` : ""}{filters.q ? ` matching “${filters.q}”` : ""}
    </p>
    {jobs.length ? <div className="job-grid">{jobs.map(job => <JobCard key={job.id} job={job} />)}</div>
      : status.active === 0
        ? <div className="empty-state"><Icon name="briefcase" width={32} height={32} /><h2>Fetching the latest jobs…</h2>
            <p>{enabled.some(source => source.last_status === "failed") ? "The job boards could not be reached on the last attempt. Lumina will try again shortly." : "The first update takes a few seconds. Refresh this page in a moment."}</p>
            <Link className="button secondary" href="/opportunities/jobs">Refresh</Link></div>
        : <div className="empty-state"><Icon name="briefcase" width={32} height={32} /><h2>No jobs match these filters</h2><p>Try another career area or a broader search.</p><Link className="button secondary" href="/opportunities/jobs">Clear filters</Link></div>}
    {(filters.page > 1 || more) && <nav className="pagination" aria-label="Job pages">
      {filters.page > 1 ? <Link className="button secondary" href={href({ page: filters.page - 1 })}>Previous</Link> : <span />}
      <span className="small muted">Page {filters.page}</span>
      {more ? <Link className="button secondary" href={href({ page: filters.page + 1 })}>Next</Link> : <span />}
    </nav>}
    <p className="job-attribution small muted">
      Listings from {enabled.map((source, index) => <span key={source.source}>{index ? (index === enabled.length - 1 ? " and " : ", ") : ""}{SOURCE_SITES[source.source]
        ? <a href={SOURCE_SITES[source.source]} target="_blank" rel="noopener noreferrer nofollow">{source.label}</a> : source.label}</span>)}
      {lastUpdate ? `, updated ${updatedLabel(lastUpdate)} (Nairobi time)` : ""}. Lumina does not post or screen these jobs. Check each listing before you apply and never pay to apply.
    </p>
  </div>;
}
