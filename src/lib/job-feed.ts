import "server-only";
import { after } from "next/server";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { limitedJson } from "@/lib/mentor-search";
import {
  fromHimalayas, fromJobWebKenya, fromJSearch, JOB_TOPICS, parseRssItems, JOB_TOPIC_IDS, JSEARCH_GENERAL_QUERY,
  type JobSource, type JobTopic, type NormalizedJob, type WorkMode,
} from "@/lib/job-sources";

/**
 * Kenya job feed: real listings fetched from external job boards at most once a
 * day, cached in PostgreSQL (external_jobs) and shown on /opportunities/jobs.
 * Page views never wait for a provider; a stale feed is refreshed after the
 * response (next/server `after`), and administrators can force a refresh.
 */
const REFRESH_AFTER_HOURS = 24;
const RETRY_AFTER_FAILURE_MINUTES = 60;
/** Listings the provider stopped returning are kept this long, then removed. */
const KEEP_UNSEEN_DAYS = 3;
const ADVISORY_LOCK = 2042009;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESPONSE_BYTES = 4_000_000;
// A generic client name only; no personal or project-owner details go to providers.
const USER_AGENT = "Lumina/1.0 (alumni community prototype; daily server-side job feed)";

type FeedRequest = { topic: JobTopic | null; url: URL; headers: Record<string, string> };
type Provider = { source: JobSource; label: string; format?: "json" | "rss"; enabled(): boolean; requests(): FeedRequest[]; parse(body: unknown): NormalizedJob[] };
/** JobWebKenya posts about 100 jobs a day, 10 per feed page: 10 pages cover roughly the last day. */
const JOBWEBKENYA_PAGES = 10;
class FeedError extends Error {}

const listOf = (body: unknown, key: string) => {
  const list = body && typeof body === "object" ? (body as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(list)) throw new FeedError("unexpected response");
  return list;
};
const keep = (job: NormalizedJob | null): job is NormalizedJob => job !== null;

export const PROVIDERS: Provider[] = [
  {
    source: "himalayas", label: "Himalayas",
    enabled: () => process.env.JOB_FEED_HIMALAYAS !== "off",
    requests: () => JOB_TOPICS.map(topic => ({
      topic: topic.id, headers: {},
      url: new URL(`https://himalayas.app/jobs/api/search?${new URLSearchParams({ q: topic.himalayas, country: "Kenya", sort: "recent" })}`),
    })),
    parse: body => listOf(body, "jobs").map(fromHimalayas).filter(keep),
  },
  {
    source: "jsearch", label: "JSearch (Google for Jobs)",
    enabled: () => Boolean(process.env.JSEARCH_API_KEY),
    requests: () => {
      const host = process.env.JSEARCH_API_HOST || "jsearch.p.rapidapi.com";
      const headers = { "X-RapidAPI-Key": process.env.JSEARCH_API_KEY || "", "X-RapidAPI-Host": host };
      const queries: { topic: JobTopic | null; query: string }[] = [{ topic: null, query: JSEARCH_GENERAL_QUERY },
        ...JOB_TOPICS.flatMap(topic => "jsearch" in topic ? [{ topic: topic.id, query: topic.jsearch }] : [])];
      // 3 requests a day stays well inside the free plan's 200 a month.
      return queries.map(({ topic, query }) => ({ topic, headers,
        url: new URL(`https://${host}/search?${new URLSearchParams({ query, page: "1", num_pages: "1", country: "ke", date_posted: "month" })}`) }));
    },
    parse: body => listOf(body, "data").map(fromJSearch).filter(keep),
  },
  {
    source: "jobwebkenya", label: "JobWebKenya", format: "rss",
    enabled: () => process.env.JOB_FEED_JOBWEBKENYA !== "off",
    requests: () => Array.from({ length: JOBWEBKENYA_PAGES }, (_, index) => ({
      topic: null, headers: { Accept: "application/rss+xml, application/xml;q=0.9" },
      url: new URL(index ? `https://jobwebkenya.com/feed/?paged=${index + 1}` : "https://jobwebkenya.com/feed/"),
    })),
    parse: body => {
      const items = parseRssItems(body);
      if (!items.length) throw new FeedError("unexpected response");
      return items.map(fromJobWebKenya).filter(keep);
    },
  },
];

async function limitedText(body: ReadableStream<Uint8Array> | null, maxBytes: number) {
  if (!body) throw new FeedError("unreadable response");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new FeedError("response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

async function fetchJobs(request: FeedRequest, fetcher: typeof fetch, format: "json" | "rss" = "json") {
  const response = await fetcher(request.url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT, ...request.headers },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new FeedError(`HTTP ${response.status}`);
  }
  if (format === "rss") return limitedText(response.body, MAX_RESPONSE_BYTES);
  try {
    return await limitedJson(response.body, MAX_RESPONSE_BYTES);
  } catch {
    throw new FeedError("unreadable response");
  }
}

const errorCode = (error: unknown) => error instanceof FeedError ? error.message
  : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout"
  : error instanceof TypeError ? "network error" : "unexpected error";

async function isDue(conn: PoolClient, source: JobSource) {
  const last = (await conn.query<{ status: string; minutes: number }>(
    `SELECT status, extract(epoch FROM CURRENT_TIMESTAMP - started_at)::float / 60 AS minutes
     FROM job_feed_runs WHERE source = $1 ORDER BY started_at DESC, id DESC LIMIT 1`, [source])).rows[0];
  if (!last) return true;
  if (last.status === "succeeded") return last.minutes >= REFRESH_AFTER_HOURS * 60;
  return last.minutes >= RETRY_AFTER_FAILURE_MINUTES;
}

const UPSERT = `INSERT INTO external_jobs (source, source_job_id, title, company, company_logo_url, location, work_mode, employment_type,
    seniority, excerpt, salary_min, salary_max, salary_currency, salary_period, topics, apply_url, source_url, publisher, posted_at, expires_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
  ON CONFLICT (source, source_job_id) DO UPDATE SET title = EXCLUDED.title, company = EXCLUDED.company,
    company_logo_url = EXCLUDED.company_logo_url, location = EXCLUDED.location, work_mode = EXCLUDED.work_mode,
    employment_type = EXCLUDED.employment_type, seniority = EXCLUDED.seniority, excerpt = EXCLUDED.excerpt,
    salary_min = EXCLUDED.salary_min, salary_max = EXCLUDED.salary_max, salary_currency = EXCLUDED.salary_currency,
    salary_period = EXCLUDED.salary_period, topics = EXCLUDED.topics, apply_url = EXCLUDED.apply_url,
    source_url = EXCLUDED.source_url, publisher = EXCLUDED.publisher, posted_at = EXCLUDED.posted_at,
    expires_at = EXCLUDED.expires_at, last_seen_at = CURRENT_TIMESTAMP
  RETURNING (xmax = 0) AS inserted`;

export type ProviderRun = { source: JobSource; status: "succeeded" | "failed"; requests: number; seen: number; added: number; removed: number; error: string | null };

/** Fetch every topic from one provider, then store the results in one transaction. */
export async function runProvider(conn: PoolClient, provider: Provider, fetcher: typeof fetch = fetch, pauseMs = 300): Promise<ProviderRun> {
  const runId = (await conn.query<{ id: string }>("INSERT INTO job_feed_runs (source, status) VALUES ($1, 'running') RETURNING id", [provider.source])).rows[0].id;
  const requests = provider.requests();
  const found = new Map<string, { job: NormalizedJob; topics: Set<JobTopic> }>();
  let failures = 0;
  let firstError: string | null = null;
  for (const [index, request] of requests.entries()) {
    try {
      for (const job of provider.parse(await fetchJobs(request, fetcher, provider.format))) {
        const entry = found.get(job.source_job_id) ?? { job, topics: new Set<JobTopic>() };
        if (request.topic) entry.topics.add(request.topic);
        for (const topic of job.topics ?? []) entry.topics.add(topic);
        found.set(job.source_job_id, entry);
      }
    } catch (error) {
      failures++;
      firstError ??= errorCode(error);
    }
    if (pauseMs && index < requests.length - 1) await new Promise(resolve => setTimeout(resolve, pauseMs));
  }
  const complete = failures === 0;
  const status = failures === requests.length ? "failed" : "succeeded";
  let added = 0;
  let removed = 0;
  try {
    await conn.query("BEGIN");
    for (const { job, topics } of found.values()) {
      const result = await conn.query<{ inserted: boolean }>(UPSERT, [job.source, job.source_job_id, job.title, job.company,
        job.company_logo_url, job.location, job.work_mode, job.employment_type, job.seniority, job.excerpt, job.salary_min,
        job.salary_max, job.salary_currency, job.salary_period, [...topics], job.apply_url, job.source_url, job.publisher,
        job.posted_at, job.expires_at]);
      if (result.rows[0]?.inserted) added++;
    }
    // Expired listings always go. Listings no longer returned go only after a complete
    // run, so one failed request cannot empty a topic.
    removed = (await conn.query(`DELETE FROM external_jobs WHERE source = $1 AND ((expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP)
      ${complete ? `OR last_seen_at < CURRENT_TIMESTAMP - interval '${KEEP_UNSEEN_DAYS} days'` : ""})`, [provider.source])).rowCount ?? 0;
    await conn.query(`UPDATE job_feed_runs SET status = $2, finished_at = CURRENT_TIMESTAMP, requests = $3, jobs_seen = $4,
      jobs_added = $5, jobs_removed = $6, error = $7 WHERE id = $1`,
      [runId, status, requests.length, found.size, added, removed, firstError && (complete ? firstError : `${failures} of ${requests.length} requests failed: ${firstError}`).slice(0, 120)]);
    await conn.query("COMMIT");
  } catch (error) {
    await conn.query("ROLLBACK").catch(() => {});
    await conn.query("UPDATE job_feed_runs SET status = 'failed', finished_at = CURRENT_TIMESTAMP, requests = $2, error = 'could not store results' WHERE id = $1",
      [runId, requests.length]).catch(() => {});
    console.error("Job feed could not be stored", error instanceof Error ? error.name : "UnknownError");
    return { source: provider.source, status: "failed", requests: requests.length, seen: found.size, added: 0, removed: 0, error: "could not store results" };
  }
  return { source: provider.source, status, requests: requests.length, seen: found.size, added, removed, error: firstError };
}

/**
 * Refresh every enabled provider that is due (or all of them when forced). Only
 * one refresh runs at a time across all server processes (advisory lock).
 */
export async function refreshJobFeed(options: { force?: boolean; fetcher?: typeof fetch; pauseMs?: number } = {}): Promise<{ busy: boolean; runs: ProviderRun[] }> {
  const conn = await database().connect();
  let locked = false;
  try {
    locked = (await conn.query<{ ok: boolean }>("SELECT pg_try_advisory_lock($1) AS ok", [ADVISORY_LOCK])).rows[0].ok;
    if (!locked) return { busy: true, runs: [] };
    const runs: ProviderRun[] = [];
    for (const provider of PROVIDERS) {
      if (!provider.enabled() || (!options.force && !await isDue(conn, provider.source))) continue;
      runs.push(await runProvider(conn, provider, options.fetcher, options.pauseMs));
    }
    return { busy: false, runs };
  } finally {
    if (locked) await conn.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK]).catch(() => {});
    conn.release();
  }
}

/** Starts a refresh when one is due. Never throws. */
export async function refreshJobFeedIfDue() {
  try {
    await refreshJobFeed();
  } catch (error) {
    console.error("Job feed refresh failed", error instanceof Error ? error.name : "UnknownError");
  }
}

/**
 * Queues a due refresh to run after the current response, so no page waits for a
 * provider. Outside a request (unit tests, scripts) it does nothing; scheduling
 * must never be able to break the page that asked for it.
 */
export function scheduleJobFeedRefresh() {
  try {
    after(refreshJobFeedIfDue);
  } catch {
    // No request scope: nothing to schedule.
  }
}

export type ExternalJob = Omit<NormalizedJob, "salary_min" | "salary_max"> & {
  id: string; topics: JobTopic[]; salary_min: number | null; salary_max: number | null; recommended: boolean;
};
export type JobFilters = { q: string; topic: JobTopic | "for-you" | null; mode: WorkMode | null; page: number };
export const JOBS_PER_PAGE = 24;
const VISIBLE = `(j.expires_at IS NULL OR j.expires_at > CURRENT_TIMESTAMP) AND j.last_seen_at > CURRENT_TIMESTAMP - interval '${KEEP_UNSEEN_DAYS} days'`;

/** Validated filters from the query string; anything unexpected falls back to the default. */
export function parseJobFilters(params: Record<string, string | string[] | undefined>): JobFilters {
  const one = (key: string) => { const value = params[key]; return typeof value === "string" ? value : ""; };
  const q = one("q").normalize("NFC").replace(/[\p{Cc}\p{Cf}]/gu, "").trim().replace(/\s+/g, " ").slice(0, 100);
  const topic = one("topic");
  const mode = one("mode");
  const page = Number(one("page"));
  return {
    q, topic: topic === "for-you" ? "for-you" : (JOB_TOPIC_IDS as readonly string[]).includes(topic) ? topic as JobTopic : null,
    mode: mode === "remote" || mode === "on_site" ? mode : null,
    page: Number.isInteger(page) && page > 1 && page <= 50 ? page : 1,
  };
}

/** Visible listings, recommended ones (matching the member's topics) first, then newest. */
export async function listExternalJobs(filters: JobFilters, memberTopics: JobTopic[], limit = JOBS_PER_PAGE) {
  const values: unknown[] = [memberTopics];
  const conditions = [VISIBLE];
  if (filters.topic === "for-you") conditions.push("j.topics && $1::text[]");
  else if (filters.topic) { values.push([filters.topic]); conditions.push(`j.topics && $${values.length}::text[]`); }
  if (filters.mode) { values.push(filters.mode); conditions.push(`j.work_mode = $${values.length}`); }
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, value => `\\${value}`)}%`);
    const p = `$${values.length}`;
    conditions.push(`(j.title ILIKE ${p} OR j.company ILIKE ${p} OR j.excerpt ILIKE ${p} OR j.location ILIKE ${p})`);
  }
  values.push(limit + 1, (filters.page - 1) * limit);
  // Company-diverse order: every company's newest listing comes before anyone's second,
  // so one employer posting many similar roles cannot fill the first page.
  const rows = (await database().query<ExternalJob>(`WITH visible AS (
      SELECT j.id, j.source, j.source_job_id, j.title, j.company, j.company_logo_url,
        j.location, j.work_mode, j.employment_type, j.seniority, j.excerpt, j.salary_min::float AS salary_min, j.salary_max::float AS salary_max,
        j.salary_currency, j.salary_period, j.topics, j.apply_url, j.source_url, j.publisher, j.posted_at, j.expires_at,
        (j.topics && $1::text[]) AS recommended,
        row_number() OVER (PARTITION BY (j.topics && $1::text[]), lower(j.company) ORDER BY j.posted_at DESC NULLS LAST, j.id) AS company_rank
      FROM external_jobs j WHERE ${conditions.join(" AND ")})
    SELECT id, source, source_job_id, title, company, company_logo_url, location, work_mode, employment_type, seniority, excerpt,
      salary_min, salary_max, salary_currency, salary_period, topics, apply_url, source_url, publisher, posted_at, expires_at, recommended
    FROM visible ORDER BY recommended DESC, company_rank, posted_at DESC NULLS LAST, id
    LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
  return { jobs: rows.slice(0, limit), more: rows.length > limit };
}

export type FeedStatus = { active: number; sources: { source: JobSource; label: string; enabled: boolean; active: number;
  last_success: string | null; last_status: string | null; last_error: string | null; last_run: string | null }[] };

export async function jobFeedStatus(): Promise<FeedStatus> {
  const rows = (await database().query<{ source: JobSource; active: number; last_success: string | null; last_status: string | null; last_error: string | null; last_run: string | null }>(
    `SELECT s.source,
       (SELECT count(*)::int FROM external_jobs j WHERE j.source = s.source AND ${VISIBLE}) AS active,
       (SELECT max(finished_at)::text FROM job_feed_runs r WHERE r.source = s.source AND r.status = 'succeeded') AS last_success,
       latest.status AS last_status, latest.error AS last_error, latest.started_at::text AS last_run
     FROM (VALUES ('himalayas'), ('jsearch'), ('jobwebkenya')) AS s(source)
     LEFT JOIN LATERAL (SELECT status, error, started_at FROM job_feed_runs r WHERE r.source = s.source ORDER BY started_at DESC, id DESC LIMIT 1) latest ON TRUE`)).rows;
  const sources = PROVIDERS.map(provider => ({ ...rows.find(row => row.source === provider.source)!, label: provider.label, enabled: provider.enabled() }));
  return { active: sources.reduce((sum, source) => sum + source.active, 0), sources };
}
