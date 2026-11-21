import "server-only";

/**
 * Real job listings for the Kenya job feed: provider configuration and strict
 * normalisation. Nothing here touches the database, so it is unit-testable.
 *
 * Providers
 * - Himalayas (https://himalayas.app/api): free public API, no key. Remote roles
 *   whose location and time-zone restrictions admit applicants based in Kenya.
 *   API terms: show Himalayas as the source with a visible link, send every Apply
 *   through the supplied applicationLink, cache, and remove expired jobs.
 * - JobWebKenya (https://jobwebkenya.com): public RSS feed of on-site jobs at employers
 *   in Kenya; no key. Title, company, date, a short plain-text excerpt and a link back:
 *   every Apply goes to the JobWebKenya listing, which is credited on each card.
 * - JSearch (Google for Jobs, via RapidAPI): optional, enabled by JSEARCH_API_KEY.
 *   On-site listings in Kenya gathered from LinkedIn, BrighterMonday, Fuzu,
 *   company career pages and other boards. Free plan: 200 requests a month.
 *
 * Provider data is untrusted: every field is validated, text is reduced to plain
 * bounded strings (HTML is never stored or rendered) and links must be https.
 */
export type JobSource = "himalayas" | "jsearch" | "jobwebkenya";
export type WorkMode = "on_site" | "remote" | "hybrid";
export type NormalizedJob = {
  source: JobSource; source_job_id: string; title: string; company: string; company_logo_url: string | null;
  location: string; work_mode: WorkMode; employment_type: string | null; seniority: string | null; excerpt: string;
  salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null;
  apply_url: string; source_url: string; publisher: string; posted_at: Date | null; expires_at: Date | null;
  /** Topics a provider can infer from the listing itself (feeds without topic searches). */
  topics?: JobTopic[];
};

/**
 * Career areas the feed searches, chosen to cover the 12 Kenya Airways departments.
 * Search terms were checked against Himalayas' Kenya results for relevance.
 */
export const JOB_TOPICS = [
  { id: "aviation", label: "Aviation", himalayas: "aviation", jsearch: "aviation jobs in Kenya" },
  { id: "customer", label: "Customer service", himalayas: "customer support" },
  { id: "hospitality", label: "Hospitality", himalayas: "hospitality" },
  { id: "logistics", label: "Logistics", himalayas: "logistics", jsearch: "logistics jobs in Kenya" },
  { id: "procurement", label: "Procurement", himalayas: "procurement" },
  { id: "finance", label: "Finance", himalayas: "finance" },
  { id: "people", label: "HR & talent", himalayas: "human resources" },
  { id: "technology", label: "Technology", himalayas: "software engineer" },
  { id: "data", label: "Data", himalayas: "data analyst" },
  { id: "sales", label: "Sales", himalayas: "sales" },
  { id: "marketing", label: "Marketing", himalayas: "marketing" },
  { id: "projects", label: "Project management", himalayas: "project manager" },
  { id: "compliance", label: "Safety & compliance", himalayas: "compliance" },
] as const satisfies readonly { id: string; label: string; himalayas: string; jsearch?: string }[];
export type JobTopic = (typeof JOB_TOPICS)[number]["id"];
export const JOB_TOPIC_IDS: readonly JobTopic[] = JOB_TOPICS.map(topic => topic.id);
/** JSearch's broad query; its results carry no topic and appear under "All jobs". */
export const JSEARCH_GENERAL_QUERY = "jobs in Nairobi, Kenya";

/** Where people from each former department most often take their experience next. */
export const DEPARTMENT_TOPICS: Record<string, readonly JobTopic[]> = {
  "Cabin Services": ["customer", "hospitality", "aviation"],
  "Cargo": ["logistics", "procurement"],
  "Commercial": ["sales", "marketing"],
  "Corporate Services": ["procurement", "projects", "finance"],
  "Customer Experience": ["customer", "hospitality"],
  "Engineering & Maintenance": ["aviation", "compliance", "projects"],
  "Finance": ["finance"],
  "Flight Operations": ["aviation", "projects"],
  "Ground Operations": ["logistics", "aviation", "customer"],
  "Human Resources": ["people"],
  "ICT / Digital": ["technology", "data"],
  "Safety & Quality": ["compliance", "aviation"],
};

export function topicsForDepartment(department: string | null | undefined): JobTopic[] {
  return department ? [...(DEPARTMENT_TOPICS[department] ?? [])] : [];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

/** Plain, single-spaced text of at most `max` characters; HTML tags and control characters removed. */
export function plainText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const text = value.slice(0, 100_000)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(p|div|li|ul|ol|h[1-6]|br|tr|td|section|article)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z]{2,8});/gi, (entity, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? entity;
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return point > 31 && point < 0x110000 && (point < 0xd800 || point > 0xdfff) ? String.fromCodePoint(point) : " ";
    })
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** The URL if it is an absolute https URL without credentials, otherwise null. */
export function httpsUrl(value: unknown, max = 2000): string | null {
  if (typeof value !== "string" || !value || value.length > max) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && url.href.length <= max ? url.href : null;
  } catch {
    return null;
  }
}

const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 && value < 1e12 ? Math.round(value * 100) / 100 : null;
const currency = (value: unknown) => typeof value === "string" && /^[A-Z]{3}$/.test(value.trim().toUpperCase()) ? value.trim().toUpperCase() : null;
const fromSeconds = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 946684800 && value < 4102444800 ? new Date(value * 1000) : null;
const fromIso = (value: unknown) => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.getUTCFullYear() >= 2000 && date.getUTCFullYear() < 2100 ? date : null;
};
const sourceId = (value: unknown) => typeof value === "string" && value.trim() && value.trim().length <= 400 ? value.trim() : null;
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
/** Kenya observes UTC+3 all year. */
const KENYA_UTC_OFFSET = 3;

/** A Himalayas search result, or null when invalid or not open to applicants in Kenya. */
export function fromHimalayas(raw: unknown): NormalizedJob | null {
  if (!raw || typeof raw !== "object") return null;
  const job = raw as Record<string, unknown>;
  // Open to Kenya when there is no location restriction or Kenya is listed, and
  // any time-zone restriction includes Kenya's offset (Himalayas' published rule).
  const countries = strings(job.locationRestrictions);
  if (countries.length && !countries.includes("Kenya")) return null;
  const zones = Array.isArray(job.timezoneRestrictions) ? job.timezoneRestrictions.filter(zone => typeof zone === "number") : [];
  if (zones.length && !zones.includes(KENYA_UTC_OFFSET)) return null;
  const id = sourceId(job.guid);
  const apply = httpsUrl(job.applicationLink);
  const title = plainText(job.title, 300);
  const company = plainText(job.companyName, 200);
  if (!id || !apply || !title || !company) return null;
  const seniority = plainText(strings(job.seniority).join(", ") || job.seniority, 80);
  return {
    source: "himalayas", source_job_id: id, title, company, company_logo_url: httpsUrl(job.companyLogo, 1000),
    location: countries.length ? (countries.length === 1 ? "Remote · Kenya" : "Remote · open to Kenya") : "Remote · worldwide",
    work_mode: "remote", employment_type: plainText(job.employmentType, 40) || null, seniority: seniority || null,
    excerpt: plainText(typeof job.description === "string" && job.description ? job.description : job.excerpt, 600),
    salary_min: amount(job.minSalary), salary_max: amount(job.maxSalary), salary_currency: currency(job.currency),
    salary_period: plainText(job.salaryPeriod, 20).toLowerCase() || null,
    apply_url: apply, source_url: apply, publisher: "Himalayas",
    posted_at: fromSeconds(job.pubDate), expires_at: fromSeconds(job.expiryDate),
  };
}

const EMPLOYMENT: Record<string, string> = { FULLTIME: "Full Time", PARTTIME: "Part Time", CONTRACTOR: "Contractor", INTERN: "Intern", TEMPORARY: "Temporary" };

/** A JSearch result, or null when invalid or located outside Kenya. */
export function fromJSearch(raw: unknown): NormalizedJob | null {
  if (!raw || typeof raw !== "object") return null;
  const job = raw as Record<string, unknown>;
  const country = typeof job.job_country === "string" ? job.job_country.trim().toUpperCase() : "";
  if (country && country !== "KE") return null;
  const id = sourceId(job.job_id);
  const apply = httpsUrl(job.job_apply_link);
  const title = plainText(job.job_title, 300);
  const company = plainText(job.employer_name, 200);
  if (!id || !apply || !title || !company) return null;
  const remote = job.job_is_remote === true;
  const place = plainText(job.job_location, 200) || [...new Set([job.job_city, job.job_state].map(value => plainText(value, 80)).filter(Boolean))].join(", ");
  const location = remote ? "Remote · Kenya" : place ? (/kenya/i.test(place) ? place : `${place}, Kenya`) : "Kenya";
  const type = typeof job.job_employment_type === "string" ? job.job_employment_type.trim().toUpperCase().replace(/[^A-Z]/g, "") : "";
  return {
    source: "jsearch", source_job_id: id, title, company, company_logo_url: httpsUrl(job.employer_logo, 1000),
    location, work_mode: remote ? "remote" : "on_site", employment_type: EMPLOYMENT[type] ?? (plainText(job.job_employment_type, 40) || null),
    seniority: null, excerpt: plainText(job.job_description, 600),
    salary_min: amount(job.job_min_salary), salary_max: amount(job.job_max_salary), salary_currency: currency(job.job_salary_currency),
    salary_period: plainText(job.job_salary_period, 20).toLowerCase() || null,
    apply_url: apply, source_url: httpsUrl(job.job_google_link) ?? apply,
    publisher: plainText(job.job_publisher, 120) || "Google for Jobs",
    posted_at: fromSeconds(job.job_posted_at_timestamp) ?? fromIso(job.job_posted_at_datetime_utc),
    expires_at: fromSeconds(job.job_offer_expiration_timestamp),
  };
}

// ---------- JobWebKenya (RSS) ----------

export type RssItem = { title: string; link: string; guid: string; pubDate: string; description: string };

const field = (item: string, tag: string) => {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(item);
  if (!match) return "";
  const value = match[1].trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/.exec(value);
  return cdata ? cdata[1] : value;
};

/** Items of an RSS 2.0 document (title, link, guid, pubDate, description); malformed items are skipped. */
export function parseRssItems(xml: unknown, max = 200): RssItem[] {
  if (typeof xml !== "string") return [];
  const items: RssItem[] = [];
  for (const match of xml.slice(0, 5_000_000).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    items.push({ title: field(match[1], "title"), link: field(match[1], "link"), guid: field(match[1], "guid"),
      pubDate: field(match[1], "pubDate"), description: field(match[1], "description") });
    if (items.length >= max) break;
  }
  return items;
}

/** Topic keywords for listings that arrive without a topic search. Word-boundary matches on the title. */
const TITLE_TOPICS: [JobTopic, RegExp][] = [
  ["aviation", /\b(aviation|airline|airport|aircraft|pilot|cabin crew|flight|aerospace)\b/i],
  ["customer", /\b(customer|client service|call cent(re|er)|contact cent(re|er)|front desk|receptionist)\b/i],
  ["hospitality", /\b(hotel|hospitality|chef|cook|housekeep|restaurant|catering|front office|tourism)\b/i],
  ["logistics", /\b(logistics|supply chain|cargo|warehouse|fleet|transport|freight|shipping|customs|driver|stores?)\b/i],
  ["procurement", /\b(procurement|purchasing|buyer|sourcing|tender)\b/i],
  ["finance", /\b(finance|financial|accountant|accounts|accounting|internal audit|tax|credit|treasury|payroll|banking|loans?|debt|collections?)\b/i],
  ["people", /\b(hr|human resources?|people|talent|recruit(er|ment)|training|learning)\b/i],
  ["technology", /\b(software|developer|ict|information technology|it (officer|support|manager|specialist|technician)|systems (administrator|engineer|analyst|developer)|network|devops|cloud|programmer|technical support|cyber ?security)\b/i],
  ["data", /\b(data|analytics|analyst|statistic(s|ian)|m&e|monitoring and evaluation)\b/i],
  ["sales", /\b(sales|business development|account (manager|executive)|relationship manager|commercial|field (agents?|officers?)|agents)\b/i],
  ["marketing", /\b(marketing|brand|communications?|digital|content|public relations|pr)\b/i],
  ["projects", /\b(project|programme|program)\b/i],
  ["compliance", /\b(compliance|safety|health and safety|hse|quality|risk|regulatory|legal|auditor)\b/i],
];

export function topicsForTitle(title: string): JobTopic[] {
  return TITLE_TOPICS.filter(([, pattern]) => pattern.test(title)).map(([topic]) => topic);
}

const KENYAN_TOWNS = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika", "Machakos", "Nyeri", "Meru", "Kitale",
  "Malindi", "Naivasha", "Garissa", "Kakamega", "Kericho", "Embu", "Lamu", "Isiolo", "Kitui", "Kilifi", "Lodwar", "Nanyuki", "Narok", "Voi"];

/** A JobWebKenya RSS item ("Job title at Company"), or null when it is not a specific job. */
export function fromJobWebKenya(item: RssItem): NormalizedJob | null {
  const link = httpsUrl(plainText(item.link, 2000));
  const heading = plainText(item.title, 400);
  if (!link || !heading || new URL(link).hostname.replace(/^www\./, "") !== "jobwebkenya.com") return null;
  // "Submit CVs - New Recruitment at X (14 Positions)" is an open call, not a job.
  if (/^submit (your )?cvs?\b/i.test(heading)) return null;
  const at = heading.lastIndexOf(" at ");
  // "Field Agents at Tenakata – 7 Positions": the position count belongs to neither part.
  const positions = /\s*[–—-]?\s*\(?\d+\s+positions?\)?\s*$/i;
  const title = plainText(at > 0 ? heading.slice(0, at).replace(positions, "") : heading, 300);
  const company = plainText(at > 0 ? heading.slice(at + 4).replace(positions, "") : "", 200);
  if (!title || !company) return null;
  const guid = plainText(item.guid, 400);
  const id = sourceId(/[?&]p=(\d+)/.exec(guid)?.[1] ?? guid) ?? sourceId(link);
  const text = `${heading} ${plainText(item.description, 2000)}`;
  const town = KENYAN_TOWNS.find(name => new RegExp(`\\b${name}\\b`, "i").test(text));
  const remote = /\bremote\b/i.test(heading);
  const posted = new Date(plainText(item.pubDate, 80));
  if (!id) return null;
  return {
    source: "jobwebkenya", source_job_id: id, title, company, company_logo_url: null,
    location: remote ? "Remote · Kenya" : town ? `${town}, Kenya` : "Kenya", work_mode: remote ? "remote" : "on_site",
    employment_type: /\bintern(ship)?\b/i.test(heading) ? "Intern" : /\bcontract\b/i.test(heading) ? "Contractor" : null,
    seniority: null, excerpt: plainText(item.description, 600),
    salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
    apply_url: link, source_url: link, publisher: "JobWebKenya",
    posted_at: Number.isFinite(posted.getTime()) && posted.getUTCFullYear() >= 2000 ? posted : null, expires_at: null,
    topics: topicsForTitle(title),
  };
}
