/**
 * Reads the text of a CV (PDF or Word, extracted in the browser) and suggests
 * profile details: headline, location, About, current role, past roles with
 * dates, skills and the Kenya Airways chapter. Rule-based and deterministic: no
 * external service sees the CV. Everything it returns is a suggestion that the
 * member reviews and edits before anything is saved, so it favours recall and
 * leaves the final say to the member.
 *
 * Handles common CV layouts (section headings such as "Work experience",
 * "Skills"; a date range on or next to each role) and LinkedIn's "Save to PDF"
 * export (company line, title line, "January 2020 - Present (4 years)").
 */
import { SKILL_CATALOG } from "@/lib/skill-catalog";

export type CvExperience = { title: string; organization: string; start: string | null; end: string | null; current: boolean; description: string };
export type CvSuggestions = {
  name: string | null; headline: string | null; location: string | null; summary: string | null;
  currentTitle: string | null; currentOrganization: string | null; industry: string | null;
  experience: CvExperience[]; skills: string[];
  kq: { role: string; department: string | null; startYear: number | null; endYear: number | null } | null;
};

export const CV_LIMITS = { experience: 15, skills: 30, description: 2000, summary: 2000 } as const;

type Section = "top" | "summary" | "experience" | "skills" | "other";
type Line = { text: string; bullet: boolean };

const HEADINGS: [RegExp, Section][] = [
  [/^(?:professional |career |personal |executive )?(?:summary|profile|objective|about(?: me)?|overview|career objective)$/, "summary"],
  [/^(?:work |professional |employment |career |relevant |working )?(?:experience|history|employment)(?: history)?$/, "experience"],
  [/^(?:(?:top|key|core|technical|professional|relevant|other) )?(?:skills|competencies|competences|expertise|areas of expertise|skills (?:and|&) (?:abilities|competencies))$/, "skills"],
  [/^(?:education(?:al background)?|academic (?:background|qualifications)|qualifications|certifications?|licen[cs]es(?: (?:and|&) certifications)?|training|courses|languages|referees|references|interests|hobbies(?: (?:and|&) interests)?|projects|awards|honou?rs(?: (?:and|&) awards)?|publications|volunteer(?:ing)?(?: experience)?|contact(?: information| details)?|personal (?:details|information|data)|achievements|memberships|affiliations|declaration)$/, "other"],
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const POINT = `(?:(?:${MONTH})\\.?,?\\s+\\d{4}|\\d{1,2}\\s*[/.]\\s*\\d{4}|(?:19|20)\\d{2})`;
const OPEN_END = "present|current(?:ly)?|now|to date|till date|date|ongoing";
const RANGE = new RegExp(`(${POINT})\\s*(?:-|–|—|to|until|till)\\s*(${POINT}|${OPEN_END})`, "i");
const DURATION = /^\(?\s*(?:less than a year|\d+ (?:years?|yrs?|months?|mos?)(?: \d+ (?:months?|mos?))?)\s*\)?$/i;
const CONTACT = /@|https?:|www\.|linkedin\.com|\+?\d[\d\s()-]{7,}|p\.?\s?o\.?\s?box/i;

const TITLE_WORDS = /\b(?:engineer|manager|officer|analyst|assistant|director|lead|head|consultant|specialist|administrator|supervisor|coordinator|intern|developer|architect|captain|pilot|first officer|crew|attendant|purser|technician|executive|accountant|clerk|agent|representative|associate|trainee|controller|planner|designer|advis[eo]r|chief|president|founder|owner|teacher|lecturer|nurse|auditor|scientist|programmer|instructor|trainer|operator|inspector|dispatcher|steward|stewardess|cashier|receptionist|secretary|partner|principal|mentor|volunteer|strategist|marketer|economist|lawyer|advocate|surveyor|mechanic|electrician|chef|driver|tutor)s?\b/i;
const ORG_WORDS = /\b(?:ltd|limited|plc|inc|llc|llp|co\.|company|corporation|corp|group|bank|airways|airlines|airline|aviation|university|college|school|institute|ministry|authority|agency|foundation|trust|council|commission|services|solutions|technologies|technology|consult(?:ing|ants)?|partners|associates|international|africa|kenya|hospital|sacco|board|organi[sz]ation|ngo|holdings|enterprises|industries|logistics|systems)\b/i;
const PLACES = /\b(?:kenya|nairobi|mombasa|kisumu|nakuru|eldoret|thika|nyeri|machakos|kitale|malindi|naivasha|kericho|kakamega|meru|embu|garissa|uganda|kampala|tanzania|dar es salaam|arusha|rwanda|kigali|ethiopia|addis ababa|south africa|johannesburg|nigeria|lagos|ghana|accra|dubai|doha|qatar|uae|united arab emirates|united kingdom|london|usa|united states|remote|area)\b/i;

const DEPARTMENTS: [RegExp, string][] = [
  [/cabin|flight attendant|purser|steward|in-?flight/i, "Cabin Services"],
  [/pilot|first officer|captain|flight operations|dispatcher|crew scheduling/i, "Flight Operations"],
  [/engineer(?!.*(?:software|network|systems|data))|technician|maintenance|avionics|mechanic|mro/i, "Engineering & Maintenance"],
  [/\bict\b|\bit\b|software|systems|network|developer|data|digital|cyber/i, "ICT / Digital"],
  [/financ|accountant|revenue|treasury|audit(?:or)?\b(?!.*safety)|payroll/i, "Finance"],
  [/human resources|\bhr\b|recruit|talent|learning (?:and|&) development|training/i, "Human Resources"],
  [/customer|call centre|call center|service agent|guest|reservations|ticketing|passenger/i, "Customer Experience"],
  [/ground|ramp|baggage|handling|load control|station/i, "Ground Operations"],
  [/cargo|freight/i, "Cargo"],
  [/safety|quality|security|compliance/i, "Safety & Quality"],
  [/sales|marketing|commercial|network planning|pricing|alliances|brand/i, "Commercial"],
  [/admin|legal|procurement|corporate|communications|secretar/i, "Corporate Services"],
];
const INDUSTRIES: [RegExp, string][] = [
  [/airways|airlines|aviation|airport|aerospace/i, "Aviation"], [/bank|financ|capital|insurance|sacco|microfinance/i, "Finance"],
  [/cloud|software|technolog|digital|data|telecom|safaricom|systems/i, "Technology"], [/logistics|freight|shipping|transport|courier/i, "Logistics"],
  [/hotel|hospitality|resort|lodge|tourism|travel/i, "Hospitality"], [/consult/i, "Consulting"], [/school|university|college|academy|education/i, "Education"],
];

// Catalog names that are ordinary words too: only accepted from a Skills section, never from free text.
const AMBIGUOUS = new Set(["c", "r", "go", "swift", "rust", "driving", "unity", "theatre", "english", "sage"]);

const clean = (value: string) => value.replace(/\s+/g, " ").replace(/^[\s,;:|•·–—-]+|[\s,;:|•·–—-]+$/g, "").trim();
const letters = (value: string) => (value.match(/\p{L}/gu) || []).length;
const headingOf = (text: string): Section | null => {
  const key = text.toLowerCase().replace(/[:.]+$/, "").replace(/\s+/g, " ").trim();
  if (key.length > 45) return null;
  return HEADINGS.find(([pattern]) => pattern.test(key))?.[1] ?? null;
};

export function cvLines(raw: string): Line[] {
  return raw.replace(/\r\n?/g, "\n").replace(/[   ]/g, " ").replace(/[​-‍﻿]/g, "").split("\n")
    .map(line => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .map(line => {
      const bullet = /^(?:[•●▪◦‣∙·*➢➤►✓✔-]|\d+[.)])\s+/.test(line) || /^[•●▪◦‣∙·➢➤►✓✔]/.test(line);
      return { text: bullet ? line.replace(/^(?:[•●▪◦‣∙·*➢➤►✓✔-]|\d+[.)])\s*/, "") : line, bullet };
    })
    .filter(line => line.text && !/^page \d+( of \d+)?$/i.test(line.text));
}

function toMonth(point: string, edge: "start" | "end", today: Date): string | null {
  const value = point.toLowerCase().trim();
  const year = Number(value.match(/(19|20)\d{2}/)?.[0]);
  if (!year || year < 1960 || (edge === "start" && year > today.getFullYear())) return null;
  const named = MONTHS.findIndex(month => value.startsWith(month));
  const numeric = value.match(/^(\d{1,2})\s*[/.]/);
  let month = named >= 0 ? named + 1 : numeric ? Number(numeric[1]) : edge === "start" ? 1 : 12;
  if (month < 1 || month > 12) month = edge === "start" ? 1 : 12;
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const result = `${year}-${String(month).padStart(2, "0")}`;
  return result > thisMonth ? thisMonth : result;
}

const titleScore = (value: string) => (TITLE_WORDS.test(value) ? 2 : 0) - (ORG_WORDS.test(value) ? 1 : 0);
const orgScore = (value: string) => (ORG_WORDS.test(value) ? 2 : 0) - (TITLE_WORDS.test(value) ? 1 : 0);

/** Splits "Title at Company", "Company | Title", "Title, Company" … into its two parts. */
function splitHeader(value: string): { title: string; organization: string } {
  for (const separator of [/\s+at\s+/i, /\s+@\s+/, /\s*\|\s*/, /\s+[–—]\s+/, /\s+-\s+/, /,\s+/]) {
    const at = value.search(separator);
    if (at > 0) {
      const match = value.slice(at).match(separator)![0];
      const left = clean(value.slice(0, at)), right = clean(value.slice(at + match.length));
      if (letters(left) >= 2 && letters(right) >= 2) {
        if (/\s+at\s+|\s+@\s+/i.test(match)) return { title: left, organization: right };
        return titleScore(right) > titleScore(left) || orgScore(left) > orgScore(right)
          ? { title: right, organization: left } : { title: left, organization: right };
      }
    }
  }
  return orgScore(value) > titleScore(value) ? { title: "", organization: clean(value) } : { title: clean(value), organization: "" };
}

const headerish = (line: Line) => !line.bullet && line.text.length <= 90 && letters(line.text) >= 2 && !/[.;]$/.test(line.text)
  && !RANGE.test(line.text) && !headingOf(line.text) && !CONTACT.test(line.text) && line.text.split(" ").length <= 12;
const looksLikePlace = (text: string) => text.length <= 60 && PLACES.test(text) && !TITLE_WORDS.test(text) && !/\d{3,}/.test(text) && text.split(" ").length <= 7;

type Anchor = { index: number; headerStart: number; title: string; organization: string; start: string; end: string | null; current: boolean };

function parseExperience(lines: Line[], linkedIn: boolean, today: Date): (CvExperience & { location: string | null })[] {
  const dated = lines.map((line, index) => (RANGE.test(line.text) ? index : -1)).filter(index => index >= 0);
  // Pass 1: each date line and the header (title and organization) that belongs to it.
  const anchors: Anchor[] = [];
  for (const index of dated) {
    const match = lines[index].text.match(RANGE)!;
    const start = toMonth(match[1], "start", today);
    const current = new RegExp(`^(?:${OPEN_END})$`, "i").test(match[2].trim());
    const end = current ? null : toMonth(match[2], "end", today);
    if (!start || (end && end < start)) continue;
    const previous = anchors.at(-1);
    const floor = previous ? previous.index + 1 : 0;
    const rest = clean(lines[index].text.replace(match[0], " ").replace(/\([^)]*\)/g, " "));
    let { title, organization } = letters(rest) >= 3 ? splitHeader(rest) : { title: "", organization: "" };
    let headerStart = index;
    if (!title || !organization) {
      // Up to two header lines just above the date line, skipping a LinkedIn duration line and
      // stopping at the previous role's location line.
      const above: string[] = [];
      for (let i = index - 1; i >= floor && above.length < 2; i--) {
        if (DURATION.test(lines[i].text)) { headerStart = i; continue; }
        if (!headerish(lines[i]) || (previous && i === floor && looksLikePlace(lines[i].text))) break;
        above.unshift(lines[i].text); headerStart = i;
      }
      if (above.length === 2) {
        const [first, second] = above;
        const firstIsTitle = titleScore(first) !== titleScore(second) ? titleScore(first) > titleScore(second)
          : orgScore(first) !== orgScore(second) ? orgScore(second) > orgScore(first) : !linkedIn;
        title ||= clean(firstIsTitle ? first : second);
        organization ||= clean(firstIsTitle ? second : first);
      } else if (above.length === 1) {
        const parts = splitHeader(above[0]);
        title ||= parts.title || clean(above[0]);
        organization ||= parts.organization;
      }
      // Several roles listed under one employer (LinkedIn): reuse the employer of the role just above.
      // LinkedIn names the employer once above all its roles, so a title-only role belongs to the employer above.
      if (!organization && previous && (linkedIn || headerStart - floor <= 1)) organization = previous.organization;
    }
    if (!title && !organization) continue;
    anchors.push({ index, headerStart, title: title.slice(0, 150), organization: organization.slice(0, 200), start, end, current });
  }
  // Pass 2: an optional location line, then the description up to the next role's header.
  const entries = anchors.map((anchor, k) => {
    let next = anchor.index + 1, location: string | null = null;
    if (next < lines.length && !lines[next].bullet && looksLikePlace(lines[next].text)) { location = clean(lines[next].text); next++; }
    const stop = k + 1 < anchors.length ? anchors[k + 1].headerStart : lines.length;
    const description = lines.slice(next, Math.max(next, stop)).filter(item => !headingOf(item.text))
      .map(item => (item.bullet ? `• ${item.text}` : item.text)).join("\n").slice(0, CV_LIMITS.description).trim();
    return { title: anchor.title, organization: anchor.organization, start: anchor.start, end: anchor.end, current: anchor.current, description, location };
  });
  const seen = new Set<string>();
  return entries.filter(entry => {
    const key = `${entry.title.toLowerCase()}|${entry.organization.toLowerCase()}|${entry.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => Number(b.current) - Number(a.current) || (b.start || "").localeCompare(a.start || "")).slice(0, CV_LIMITS.experience);
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CATALOG = [...new Map(SKILL_CATALOG.map(name => [name.toLowerCase(), name])).values()];
const CATALOG_BY_KEY = new Map(CATALOG.map(name => [name.toLowerCase(), name]));
const CATALOG_PATTERNS = CATALOG.filter(name => !AMBIGUOUS.has(name.toLowerCase()) && name.length >= 3)
  .map(name => ({ name, pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}+#])`, name.length <= 4 && name === name.toUpperCase() ? "gu" : "giu") }));

function parseSkills(skillLines: Line[], fullText: string): string[] {
  const explicit: string[] = [];
  for (const line of skillLines) {
    const label = line.text.match(/^([^:]{2,40}):\s*(.+)$/);
    for (const part of (label ? label[2] : line.text).split(/\s*(?:[,;|•·]|\s-\s|\s{2,}|\band\b(?=\s+[A-Z]))\s*/)) {
      const item = clean(part).replace(/\.$/, "");
      if (item.length < 2 || item.length > 50 || item.split(" ").length > 6 || /[.!?]\s/.test(item) || CONTACT.test(item)) continue;
      explicit.push(CATALOG_BY_KEY.get(item.toLowerCase()) ?? item);
    }
  }
  const counts = new Map<string, number>();
  for (const { name, pattern } of CATALOG_PATTERNS) {
    const found = fullText.match(pattern)?.length ?? 0;
    if (found) counts.set(name, found);
  }
  const implicit = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).map(([name]) => name);
  const seen = new Set<string>();
  return [...explicit, ...implicit].filter(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, CV_LIMITS.skills);
}

export function parseCv(raw: string, today = new Date()): CvSuggestions {
  const lines = cvLines(raw);
  const linkedIn = /linkedin\.com\/in\//i.test(raw) && lines.some(line => /^top skills$/i.test(line.text));
  const sections: Record<Section, Line[]> = { top: [], summary: [], experience: [], skills: [], other: [] };
  let current: Section = "top";
  for (const line of lines) {
    const heading = line.bullet ? null : headingOf(line.text);
    if (heading) { current = heading; continue; }
    sections[current].push(line);
  }
  // LinkedIn's export puts a side column (contact, Top Skills, languages) first; the name,
  // headline and location come just before Summary or Experience.
  let top = sections.top;
  if (linkedIn) {
    const at = lines.findIndex(line => !line.bullet && (headingOf(line.text) === "summary" || headingOf(line.text) === "experience"));
    if (at > 0) top = lines.slice(Math.max(0, at - 3), at).filter(line => !headingOf(line.text));
  }
  top = top.filter(line => !CONTACT.test(line.text) && !/^(?:contact|\(.*\))$/i.test(line.text));
  const nameAt = top.findIndex(line => /^[\p{Lu}][\p{L}'’.-]+(?: [\p{Lu}][\p{L}'’.-]+){1,4}$/u.test(line.text) && line.text.length <= 60 && !TITLE_WORDS.test(line.text) && !PLACES.test(line.text));
  const rawName = nameAt >= 0 ? top[nameAt].text : null;
  // "GRACE MUTHONI" -> "Grace Muthoni"; mixed-case names are kept as written.
  const name = rawName && rawName === rawName.toUpperCase() ? rawName.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase()) : rawName;
  const afterName = nameAt >= 0 ? top.slice(nameAt + 1, nameAt + 4) : top.slice(0, 3);
  const headlineLine = afterName.find(line => !looksLikePlace(line.text) && line.text.length <= 200 && letters(line.text) >= 4 && !line.bullet
    && (TITLE_WORDS.test(line.text) || /\||·/.test(line.text)));
  const locationLine = afterName.find(line => looksLikePlace(line.text)) ?? top.find(line => looksLikePlace(line.text));

  const experienceLines = sections.experience.length ? sections.experience : [...sections.top, ...sections.other];
  const experience = parseExperience(experienceLines, linkedIn, today);
  const now = experience.find(entry => entry.current) ?? null;
  const kqRoles = experience.filter(entry => /kenya airways|\bkq\b/i.test(entry.organization));
  const kq = kqRoles.length ? (() => {
    const latest = [...kqRoles].sort((a, b) => (b.start || "").localeCompare(a.start || ""))[0];
    const years = kqRoles.flatMap(entry => [entry.start, entry.end]).filter((value): value is string => Boolean(value)).map(value => Number(value.slice(0, 4)));
    const stillThere = kqRoles.some(entry => entry.current);
    return {
      role: latest.title, department: kqRoles.map(entry => DEPARTMENTS.find(([pattern]) => pattern.test(entry.title))?.[1]).find(Boolean) ?? null,
      startYear: years.length ? Math.max(1977, Math.min(...years)) : null, endYear: stillThere || !years.length ? null : Math.max(...years),
    };
  })() : null;

  const summary = sections.summary.length
    ? sections.summary.map(line => (line.bullet ? `• ${line.text}` : line.text)).join("\n").replace(/([^.\n:])\n(?!•)/g, "$1 ").slice(0, CV_LIMITS.summary).trim() || null
    : null;
  const headline = headlineLine ? clean(headlineLine.text).slice(0, 200)
    : now?.title ? `${now.title}${now.organization ? ` at ${now.organization}` : ""}`.slice(0, 200) : null;
  const industry = now ? INDUSTRIES.find(([pattern]) => pattern.test(now.organization))?.[1] ?? null : null;

  return {
    name, headline, summary, industry,
    location: (locationLine ? clean(locationLine.text) : now?.location ?? null)?.slice(0, 150) ?? null,
    currentTitle: now?.title || null, currentOrganization: now?.organization || null,
    experience: experience.map(({ location: _location, ...entry }) => entry), // eslint-disable-line @typescript-eslint/no-unused-vars
    skills: parseSkills(sections.skills, raw), kq,
  };
}
