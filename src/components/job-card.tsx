import Link from "next/link";
import { Icon } from "@/components/icon";
import type { ExternalJob } from "@/lib/job-feed";
import { salaryLabel } from "@/lib/job-format";

const MODES = { remote: "Remote", on_site: "On-site", hybrid: "Hybrid" } as const;
// Links leave Lumina for the original listing: no referrer, no opener, no ranking credit.
const external = { target: "_blank", rel: "noopener noreferrer nofollow" } as const;

export function postedLabel(date: Date | string | null, now = new Date()) {
  if (!date) return "Recently posted";
  const days = Math.floor((now.getTime() - new Date(date).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "Recently posted";
  if (days === 0) return "Posted today";
  if (days === 1) return "Posted yesterday";
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return `Posted ${months} month${months === 1 ? "" : "s"} ago`;
}

function CompanyLogo({ job }: { job: ExternalJob }) {
  const initials = job.company.split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]?.toUpperCase()).join("") || "?";
  return <span className="job-logo" aria-hidden="true">
    {job.company_logo_url
      // eslint-disable-next-line @next/next/no-img-element -- logos come from many provider CDNs; plain, lazy, no referrer
      ? <img src={job.company_logo_url} alt="" width={48} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      : <span>{initials}</span>}
  </span>;
}

export function JobCard({ job, compact = false }: { job: ExternalJob; compact?: boolean }) {
  const salary = salaryLabel(job);
  return <article className={`job-card${compact ? " job-card-compact" : ""}`}>
    <CompanyLogo job={job} />
    <div className="job-body">
      <div className="card-meta">
        {job.recommended && <span className="job-badge"><Icon name="spark" width={12} height={12} />For you</span>}
        <span>{MODES[job.work_mode]}</span>
        {job.employment_type && <span>{job.employment_type}</span>}
      </div>
      <h3><a href={job.source_url} {...external}>{job.title}</a></h3>
      <p className="job-company">{job.company}</p>
      <p className="location">{job.location}</p>
      {salary && <p className="job-salary">{salary}</p>}
      {!compact && job.excerpt && <p className="job-excerpt">{job.excerpt}</p>}
      <div className="job-footer">
        <span className="small muted">{postedLabel(job.posted_at)} · via <a href={job.source_url} {...external}>{job.publisher}</a></span>
        <a className="button job-apply" href={job.apply_url} {...external} aria-label={`Apply for ${job.title} at ${job.company} on ${job.publisher} (opens in a new tab)`}>
          Apply<Icon name="arrow" width={16} height={16} />
        </a>
      </div>
    </div>
  </article>;
}

export function OpportunityTabs({ active, jobCount }: { active: "community" | "jobs"; jobCount?: number }) {
  return <nav className="opportunity-tabs" aria-label="Opportunity listings">
    <Link href="/opportunities" aria-current={active === "community" ? "page" : undefined}>From the community</Link>
    <Link href="/opportunities/jobs" aria-current={active === "jobs" ? "page" : undefined}>
      Jobs in Kenya{typeof jobCount === "number" && jobCount > 0 ? <span className="tab-count">{jobCount}</span> : null}
    </Link>
  </nav>;
}
