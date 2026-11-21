import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ database: () => { throw new Error("no database in unit tests"); } }));

import { DEPARTMENT_TOPICS, fromHimalayas, fromJobWebKenya, fromJSearch, httpsUrl, JOB_TOPIC_IDS, parseRssItems, plainText, topicsForDepartment, topicsForTitle } from "@/lib/job-sources";
import { salaryLabel } from "@/lib/job-format";
import { parseJobFilters, PROVIDERS } from "@/lib/job-feed";
import { postedLabel } from "@/components/job-card";

// Parser fixtures shaped like each provider's documented fields. Fictional values only.
const himalayas = {
  guid: "https://himalayas.app/companies/example-air/jobs/operations-analyst",
  title: "Operations <b>Analyst</b>", companyName: "Example Air &amp; Cargo", companyLogo: "https://cdn-images.himalayas.app/example",
  employmentType: "Full Time", seniority: ["Mid-level", "Senior"], minSalary: 2500, maxSalary: 3500, currency: "usd", salaryPeriod: "monthly",
  locationRestrictions: [], timezoneRestrictions: [0, 1, 2, 3, 4],
  description: "<h2>About the role</h2><p>Plan&nbsp;flights</p><script>alert(1)</script>",
  excerpt: "About the rolePlan flights", applicationLink: "https://himalayas.app/companies/example-air/jobs/operations-analyst",
  pubDate: 1794891671, expiryDate: 1797483671,
};
const jsearch = {
  job_id: "abc123==", job_title: "Customer Service Agent", employer_name: "Example Logistics Ltd", employer_logo: null,
  job_publisher: "LinkedIn", job_employment_type: "FULLTIME", job_apply_link: "https://www.linkedin.com/jobs/view/1",
  job_description: "Serve customers at JKIA.", job_is_remote: false, job_city: "Nairobi", job_state: "Nairobi County", job_country: "KE",
  job_min_salary: 60000, job_max_salary: 90000, job_salary_currency: "KES", job_salary_period: "MONTH",
  job_posted_at_timestamp: 1794891671, job_google_link: "https://www.google.com/search?q=example",
};

describe("job feed normalisation", () => {
  it("normalises a Himalayas listing open to Kenya into plain, bounded text", () => {
    const job = fromHimalayas(himalayas)!;
    expect(job).toMatchObject({
      source: "himalayas", source_job_id: himalayas.guid, title: "Operations Analyst", company: "Example Air & Cargo",
      location: "Remote · worldwide", work_mode: "remote", employment_type: "Full Time", seniority: "Mid-level, Senior",
      excerpt: "About the role Plan flights", salary_min: 2500, salary_max: 3500, salary_currency: "USD", salary_period: "monthly",
      apply_url: himalayas.applicationLink, source_url: himalayas.applicationLink, publisher: "Himalayas",
    });
    expect(job.posted_at?.toISOString()).toBe(new Date(1794891671000).toISOString());
    expect(job.excerpt).not.toContain("alert");
  });

  it("keeps only Himalayas roles open to applicants located in Kenya (UTC+3)", () => {
    expect(fromHimalayas({ ...himalayas, locationRestrictions: ["Kenya"] })?.location).toBe("Remote · Kenya");
    expect(fromHimalayas({ ...himalayas, locationRestrictions: ["Kenya", "Uganda"] })?.location).toBe("Remote · open to Kenya");
    expect(fromHimalayas({ ...himalayas, locationRestrictions: ["United States"] })).toBeNull();
    expect(fromHimalayas({ ...himalayas, timezoneRestrictions: [-5, -4] })).toBeNull();
  });

  it("rejects listings without a safe https link, title or company", () => {
    expect(fromHimalayas({ ...himalayas, applicationLink: "javascript:alert(1)" })).toBeNull();
    expect(fromHimalayas({ ...himalayas, applicationLink: "http://himalayas.app/x" })).toBeNull();
    expect(fromHimalayas({ ...himalayas, title: "<p> </p>" })).toBeNull();
    expect(fromHimalayas({ ...himalayas, companyName: undefined })).toBeNull();
    expect(fromHimalayas(null)).toBeNull();
    expect(fromHimalayas("job")).toBeNull();
  });

  it("normalises a JSearch listing in Kenya and drops other countries", () => {
    expect(fromJSearch(jsearch)).toMatchObject({
      source: "jsearch", source_job_id: "abc123==", location: "Nairobi, Nairobi County, Kenya", work_mode: "on_site",
      employment_type: "Full Time", publisher: "LinkedIn", salary_currency: "KES", salary_period: "month",
      apply_url: jsearch.job_apply_link, source_url: jsearch.job_google_link, company_logo_url: null,
    });
    expect(fromJSearch({ ...jsearch, job_is_remote: true })?.location).toBe("Remote · Kenya");
    expect(fromJSearch({ ...jsearch, job_country: "US" })).toBeNull();
    expect(fromJSearch({ ...jsearch, job_apply_link: "ftp://example.com" })).toBeNull();
    expect(fromJSearch({ ...jsearch, job_google_link: undefined })?.source_url).toBe(jsearch.job_apply_link);
  });

  it("sanitises text and links", () => {
    expect(plainText("<style>x{}</style>A&lt;B &#38; C\u0000​  D", 50)).toBe("A<B & C D");
    expect(plainText("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`);
    expect(plainText(42, 10)).toBe("");
    expect(httpsUrl("https://user:pw@example.com")).toBeNull();
    expect(httpsUrl("https://example.com/" + "a".repeat(3000))).toBeNull();
    expect(httpsUrl("https://example.com/job?id=1")).toBe("https://example.com/job?id=1");
  });

  it("labels salaries and posting dates", () => {
    expect(salaryLabel({ salary_min: 60000, salary_max: 90000, salary_currency: "KES", salary_period: "month" })).toBe("KES 60,000–90,000 / month");
    expect(salaryLabel({ salary_min: null, salary_max: 5000, salary_currency: "USD", salary_period: "yearly" })).toBe("USD 5,000 / year");
    expect(salaryLabel({ salary_min: null, salary_max: null, salary_currency: null, salary_period: null })).toBeNull();
    const now = new Date("2026-11-17T12:00:00Z");
    expect(postedLabel(new Date("2026-11-17T08:00:00Z"), now)).toBe("Posted today");
    expect(postedLabel(new Date("2026-11-14T08:00:00Z"), now)).toBe("Posted 3 days ago");
    expect(postedLabel(new Date("2026-09-10T08:00:00Z"), now)).toBe("Posted 2 months ago");
    expect(postedLabel(null, now)).toBe("Recently posted");
  });
});

describe("job feed recommendations and filters", () => {
  it("maps all twelve Kenya Airways departments to valid career topics", () => {
    expect(Object.keys(DEPARTMENT_TOPICS)).toHaveLength(12);
    for (const topics of Object.values(DEPARTMENT_TOPICS)) {
      expect(topics.length).toBeGreaterThan(0);
      for (const topic of topics) expect(JOB_TOPIC_IDS).toContain(topic);
    }
    expect(topicsForDepartment("Cargo")).toEqual(["logistics", "procurement"]);
    expect(topicsForDepartment(null)).toEqual([]);
    expect(topicsForDepartment("Unknown")).toEqual([]);
  });

  it("accepts only known filter values", () => {
    expect(parseJobFilters({ q: "  pilot\u0000  jobs ", topic: "aviation", mode: "remote", page: "3" })).toEqual({ q: "pilot jobs", topic: "aviation", mode: "remote", page: 3 });
    expect(parseJobFilters({ topic: "for-you", mode: "on_site" })).toMatchObject({ topic: "for-you", mode: "on_site", page: 1 });
    expect(parseJobFilters({ topic: "' OR 1=1", mode: "anywhere", page: "-2", q: ["a", "b"] })).toEqual({ q: "", topic: null, mode: null, page: 1 });
    expect(parseJobFilters({ page: "51" }).page).toBe(1);
    expect(parseJobFilters({ q: "x".repeat(300) }).q).toHaveLength(100);
  });
});

describe("job feed providers", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("searches Himalayas once per topic for roles open to Kenya", () => {
    const himalayasProvider = PROVIDERS.find(provider => provider.source === "himalayas")!;
    const requests = himalayasProvider.requests();
    expect(himalayasProvider.enabled()).toBe(true);
    expect(requests).toHaveLength(JOB_TOPIC_IDS.length);
    for (const request of requests) {
      expect(request.url.origin).toBe("https://himalayas.app");
      expect(request.url.searchParams.get("country")).toBe("Kenya");
    }
    vi.stubEnv("JOB_FEED_HIMALAYAS", "off");
    expect(himalayasProvider.enabled()).toBe(false);
  });

  it("keeps JSearch off without a key and within the free plan with one", () => {
    const provider = PROVIDERS.find(candidate => candidate.source === "jsearch")!;
    vi.stubEnv("JSEARCH_API_KEY", "");
    expect(provider.enabled()).toBe(false);
    vi.stubEnv("JSEARCH_API_KEY", "test-key");
    const requests = provider.requests();
    expect(provider.enabled()).toBe(true);
    expect(requests.length).toBeLessThanOrEqual(6); // at most ~180 requests a month at one refresh a day
    expect(requests[0].headers).toEqual({ "X-RapidAPI-Key": "test-key", "X-RapidAPI-Host": "jsearch.p.rapidapi.com" });
    expect(requests.every(request => request.url.searchParams.get("country") === "ke")).toBe(true);
  });

  it("parses provider pages and rejects unexpected shapes", () => {
    const [himalayasProvider, jsearchProvider] = PROVIDERS;
    expect(himalayasProvider.parse({ jobs: [himalayas, { title: "broken" }] })).toHaveLength(1);
    expect(jsearchProvider.parse({ status: "OK", data: [jsearch] })).toHaveLength(1);
    expect(() => himalayasProvider.parse({ data: [] })).toThrow();
    expect(() => jsearchProvider.parse(null)).toThrow();
  });
});

describe("JobWebKenya RSS", () => {
  // Shaped like the board's WordPress feed; fictional employers.
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>JobWebKenya</title>
    <item><title>Cargo Operations Supervisor at Example Freight Ltd &#8211; 3 Positions</title>
      <link>https://jobwebkenya.com/jobs/cargo-operations-supervisor-example/</link>
      <guid isPermaLink="false">https://jobwebkenya.com/?post_type=job_listing&#038;p=401</guid>
      <pubDate>Thu, 19 Nov 2026 12:30:00 +0000</pubDate>
      <description><![CDATA[<p>Example Freight is hiring in <b>Mombasa</b>.</p><script>x()</script>]]></description></item>
    <item><title>Submit CVs &#8211; New Recruitment at Example Bank</title><link>https://jobwebkenya.com/jobs/submit-cvs/</link><guid>https://jobwebkenya.com/?p=402</guid></item>
    <item><title>Remote Data Analyst Internship at Example Telco</title><link>https://jobwebkenya.com/jobs/data-intern/</link><guid>https://jobwebkenya.com/?p=403</guid><pubDate>not a date</pubDate></item>
    <item><title>Accountant at Elsewhere</title><link>https://evil.example/jobs/1</link><guid>x</guid></item>
    <item><title>No employer named</title><link>https://jobwebkenya.com/jobs/x/</link><guid>https://jobwebkenya.com/?p=404</guid></item>
  </channel></rss>`;

  it("reads RSS items, including CDATA and entities", () => {
    const items = parseRssItems(rss);
    expect(items).toHaveLength(5);
    expect(items[0].guid).toBe("https://jobwebkenya.com/?post_type=job_listing&#038;p=401");
    expect(parseRssItems("<html>not a feed</html>")).toEqual([]);
    expect(parseRssItems(42)).toEqual([]);
  });

  it("normalises specific jobs and skips open calls, foreign links and missing employers", () => {
    const jobs = parseRssItems(rss).map(fromJobWebKenya);
    expect(jobs[0]).toMatchObject({
      source: "jobwebkenya", source_job_id: "401", title: "Cargo Operations Supervisor", company: "Example Freight Ltd",
      location: "Mombasa, Kenya", work_mode: "on_site", publisher: "JobWebKenya", company_logo_url: null,
      apply_url: "https://jobwebkenya.com/jobs/cargo-operations-supervisor-example/", topics: ["logistics"],
    });
    expect(jobs[0]!.excerpt).toBe("Example Freight is hiring in Mombasa.");
    expect(jobs[0]!.posted_at?.toISOString()).toBe("2026-11-19T12:30:00.000Z");
    expect(jobs[1]).toBeNull();
    expect(jobs[2]).toMatchObject({ title: "Remote Data Analyst Internship", work_mode: "remote", location: "Remote · Kenya", employment_type: "Intern", posted_at: null });
    expect(jobs[3]).toBeNull();
    expect(jobs[4]).toBeNull();
  });

  it("infers career topics from job titles", () => {
    expect(topicsForTitle("Debt Collection Officers")).toEqual(["finance"]);
    expect(topicsForTitle("Quality Management Systems (QMS) Auditor")).toEqual(["compliance"]);
    expect(topicsForTitle("Senior Software Developer")).toEqual(["technology"]);
    expect(topicsForTitle("Airport Ground Handling Supervisor")).toEqual(["aviation"]);
    expect(topicsForTitle("Executive Assistant")).toEqual([]);
  });

  it("reads ten feed pages a day without a key, unless switched off", () => {
    const provider = PROVIDERS.find(candidate => candidate.source === "jobwebkenya")!;
    expect(provider.enabled()).toBe(true);
    const urls = provider.requests().map(request => request.url.href);
    expect(urls).toHaveLength(10);
    expect(urls[0]).toBe("https://jobwebkenya.com/feed/");
    expect(urls[9]).toBe("https://jobwebkenya.com/feed/?paged=10");
    expect(() => provider.parse("<html>maintenance page</html>")).toThrow("unexpected response");
    vi.stubEnv("JOB_FEED_JOBWEBKENYA", "off");
    expect(provider.enabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});
