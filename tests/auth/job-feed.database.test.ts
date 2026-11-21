import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "pg";

vi.mock("server-only", () => ({}));
const shared = vi.hoisted(() => ({ conn: undefined as PoolClient | undefined }));
vi.mock("@/lib/db", () => ({
  database: () => ({
    connect: async () => ({ query: shared.conn!.query.bind(shared.conn), release() {} }),
    query: (...args: Parameters<PoolClient["query"]>) => shared.conn!.query(...args),
  }),
}));

import { listExternalJobs, PROVIDERS, refreshJobFeed, runProvider } from "@/lib/job-feed";

// Fictional provider pages; nothing here leaves the machine (the fetcher is injected).
const job = (slug: string, extra: Record<string, unknown> = {}) => ({
  guid: `https://himalayas.app/companies/example/jobs/${slug}`, title: `Role ${slug}`, companyName: "Example Co",
  applicationLink: `https://himalayas.app/companies/example/jobs/${slug}`, locationRestrictions: [], timezoneRestrictions: [],
  excerpt: `Work on ${slug}`, pubDate: 1794000000 + slug.length, ...extra,
});
const himalayas = PROVIDERS.find(provider => provider.source === "himalayas")!;
const pages = (byTopic: Record<string, unknown[] | number>) => (async (input: URL | RequestInfo) => {
  const q = new URL(String(input)).searchParams.get("q") || "";
  const topic = (await import("@/lib/job-sources")).JOB_TOPICS.find(candidate => candidate.himalayas === q)!.id;
  const body = byTopic[topic] ?? [];
  if (typeof body === "number") return new Response("unavailable", { status: body });
  return Response.json({ jobs: body });
}) as typeof fetch;
const rows = async () => (await shared.conn!.query("SELECT source_job_id, topics, last_seen_at FROM pg_temp.external_jobs ORDER BY source_job_id")).rows;

describe.skipIf(process.env.LUMINA_TEST_DATABASE !== "1")("Kenya job feed on live PostgreSQL temporary tables", () => {
  let pool: Pool;

  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
    const host = url?.hostname || process.env.POSTGRES_HOST || "localhost";
    const db = url ? decodeURIComponent(url.pathname.slice(1)) : process.env.POSTGRES_DB;
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || db !== "lumina") throw new Error("Database tests require the local development lumina database");
    pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 2 } : {
      host, database: db, user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, port: Number(process.env.POSTGRES_PORT || "5432"), max: 2,
    });
    shared.conn = await pool.connect();
    await shared.conn.query("CREATE TEMP TABLE external_jobs (LIKE public.external_jobs INCLUDING ALL)");
    await shared.conn.query("CREATE TEMP TABLE job_feed_runs (LIKE public.job_feed_runs INCLUDING ALL)");
  });
  beforeEach(async () => { await shared.conn!.query("DELETE FROM pg_temp.external_jobs"); await shared.conn!.query("DELETE FROM pg_temp.job_feed_runs"); });
  afterAll(async () => { shared.conn?.release(); shared.conn = undefined; await pool?.end(); });

  it("stores each listing once, merging the topics that found it, and records the run", async () => {
    const run = await runProvider(shared.conn!, himalayas, pages({ aviation: [job("pilot"), job("ops")], logistics: [job("ops")] }), 0);
    expect(run).toMatchObject({ status: "succeeded", requests: 13, seen: 2, added: 2, removed: 0, error: null });
    const stored = await rows();
    expect(stored.map(row => [row.source_job_id.split("/").at(-1), [...row.topics].sort()])).toEqual([["ops", ["aviation", "logistics"]], ["pilot", ["aviation"]]]);
    const again = await runProvider(shared.conn!, himalayas, pages({ aviation: [job("pilot"), job("ops")], logistics: [job("ops")] }), 0);
    expect(again).toMatchObject({ added: 0, seen: 2 });
    const runs = (await shared.conn!.query("SELECT status, jobs_seen, jobs_added FROM pg_temp.job_feed_runs ORDER BY id")).rows;
    expect(runs).toEqual([{ status: "succeeded", jobs_seen: 2, jobs_added: 2 }, { status: "succeeded", jobs_seen: 2, jobs_added: 0 }]);
  });

  it("removes expired listings, and unseen ones only after a complete run", async () => {
    await runProvider(shared.conn!, himalayas, pages({ aviation: [job("old"), job("expiring", { expiryDate: 1800000000 })] }), 0);
    await shared.conn!.query("UPDATE pg_temp.external_jobs SET last_seen_at = CURRENT_TIMESTAMP - interval '4 days'");
    await shared.conn!.query("UPDATE pg_temp.external_jobs SET expires_at = CURRENT_TIMESTAMP - interval '1 minute' WHERE source_job_id LIKE '%expiring'");
    // One topic failed: the expired listing goes, but the unseen one must survive.
    const partial = await runProvider(shared.conn!, himalayas, pages({ aviation: 503 }), 0);
    expect(partial.status).toBe("succeeded");
    expect(partial.error).toBe("HTTP 503");
    expect((await rows()).map(row => row.source_job_id.split("/").at(-1))).toEqual(["old"]);
    const complete = await runProvider(shared.conn!, himalayas, pages({}), 0);
    expect(complete).toMatchObject({ status: "succeeded", removed: 1 });
    expect(await rows()).toEqual([]);
  });

  it("marks a run failed when every request fails and leaves listings untouched", async () => {
    await runProvider(shared.conn!, himalayas, pages({ finance: [job("analyst")] }), 0);
    const failing = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    expect(await runProvider(shared.conn!, himalayas, failing, 0)).toMatchObject({ status: "failed", error: "network error", added: 0 });
    expect(await rows()).toHaveLength(1);
    const malformed = (async () => new Response("<html>", { status: 200 })) as typeof fetch;
    expect((await runProvider(shared.conn!, himalayas, malformed, 0)).error).toBe("unreadable response");
  });

  it("stores JobWebKenya RSS listings with topics inferred from their titles", async () => {
    const jobwebkenya = PROVIDERS.find(provider => provider.source === "jobwebkenya")!;
    const item = (id: number, heading: string) => `<item><title>${heading}</title><link>https://jobwebkenya.com/jobs/role-${id}/</link>
      <guid isPermaLink="false">https://jobwebkenya.com/?post_type=job_listing&#038;p=${id}</guid><pubDate>Thu, 19 Nov 2026 12:00:00 +0000</pubDate>
      <description><![CDATA[<p>Based in Nairobi.</p>]]></description></item>`;
    const feed = (async (input: URL | RequestInfo) => new Response(new URL(String(input)).searchParams.get("paged")
      ? "<rss><channel></channel></rss>" : `<rss><channel>${item(1, "Finance Officer at Example Water Company")}${item(2, "Logistics Coordinator at Example Freight")}${item(1, "Finance Officer at Example Water Company")}</channel></rss>`)) as typeof fetch;
    const run = await runProvider(shared.conn!, jobwebkenya, feed, 0);
    expect(run).toMatchObject({ source: "jobwebkenya", seen: 2, added: 2 });
    expect(run.status).toBe("succeeded");  // empty later pages count as failed requests but not a failed run
    const stored = (await shared.conn!.query("SELECT source_job_id, title, company, location, work_mode, topics FROM pg_temp.external_jobs ORDER BY source_job_id")).rows;
    expect(stored).toEqual([
      { source_job_id: "1", title: "Finance Officer", company: "Example Water Company", location: "Nairobi, Kenya", work_mode: "on_site", topics: ["finance"] },
      { source_job_id: "2", title: "Logistics Coordinator", company: "Example Freight", location: "Nairobi, Kenya", work_mode: "on_site", topics: ["logistics"] },
    ]);
  });

  it("refreshes at most daily, retries failures after an hour, and runs one refresh at a time", async () => {
    vi.stubEnv("JSEARCH_API_KEY", "");
    vi.stubEnv("JOB_FEED_JOBWEBKENYA", "off");  // scheduling is checked on one provider
    const fetcher = vi.fn(pages({ data: [job("analyst")] }));
    expect((await refreshJobFeed({ fetcher, pauseMs: 0 })).runs).toHaveLength(1);
    expect((await refreshJobFeed({ fetcher, pauseMs: 0 })).runs).toHaveLength(0);
    expect((await refreshJobFeed({ fetcher, force: true, pauseMs: 0 })).runs).toHaveLength(1);
    await shared.conn!.query("UPDATE pg_temp.job_feed_runs SET started_at = CURRENT_TIMESTAMP - interval '25 hours'");
    expect((await refreshJobFeed({ fetcher, pauseMs: 0 })).runs).toHaveLength(1);
    await shared.conn!.query("INSERT INTO pg_temp.job_feed_runs (source, status, started_at) VALUES ('himalayas', 'failed', CURRENT_TIMESTAMP - interval '10 minutes')");
    expect((await refreshJobFeed({ fetcher, pauseMs: 0 })).runs).toHaveLength(0);
    const other = await pool.connect();
    try {
      await other.query("SELECT pg_advisory_lock(2042009)");
      expect(await refreshJobFeed({ fetcher, force: true, pauseMs: 0 })).toEqual({ busy: true, runs: [] });
    } finally { await other.query("SELECT pg_advisory_unlock(2042009)"); other.release(); }
    vi.unstubAllEnvs();
  });

  it("lists recommended listings first, then newest, with safe search and filters", async () => {
    await runProvider(shared.conn!, himalayas, pages({
      aviation: [job("pilot", { pubDate: 1794000000 })],
      finance: [job("analyst", { pubDate: 1794900000 }), job("100%_remote", { pubDate: 1794800000 })],
    }), 0);
    const base = { q: "", topic: null, mode: null, page: 1 } as const;
    const forAviation = await listExternalJobs(base, ["aviation"]);
    expect(forAviation.jobs.map(item => [item.title, item.recommended])).toEqual([["Role pilot", true], ["Role analyst", false], ["Role 100%_remote", false]]);
    expect((await listExternalJobs({ ...base, topic: "for-you" }, ["finance"])).jobs).toHaveLength(2);
    expect((await listExternalJobs({ ...base, topic: "aviation" }, [])).jobs).toHaveLength(1);
    expect((await listExternalJobs({ ...base, mode: "on_site" }, [])).jobs).toHaveLength(0);
    expect((await listExternalJobs({ ...base, q: "100%" }, [])).jobs.map(item => item.title)).toEqual(["Role 100%_remote"]);
    expect((await listExternalJobs({ ...base, q: "%" }, [])).jobs).toHaveLength(1);
    await runProvider(shared.conn!, himalayas, pages({ sales: [job("rep-1", { pubDate: 1795000000 }), job("rep-2", { pubDate: 1794990000 }),
      job("other", { companyName: "Second Employer", pubDate: 1794100000 })] }), 0);
    // Newest first per company, but no company takes a second place before every company has one.
    expect((await listExternalJobs(base, [])).jobs.map(item => item.title).slice(0, 3)).toEqual(["Role rep-1", "Role other", "Role rep-2"]);
    const firstPage = await listExternalJobs(base, [], 2);
    expect(firstPage).toMatchObject({ more: true });
    expect(await listExternalJobs({ ...base, page: 3 }, [], 2)).toMatchObject({ more: false });
    expect((await listExternalJobs({ ...base, page: 3 }, [], 2)).jobs).toHaveLength(2);
  });
});
