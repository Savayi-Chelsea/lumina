import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";
import { googleCalendarUrl, outlookCalendarUrl } from "@/lib/calendar-links";
import { SKILL_CATALOG, searchSkills, sortSkills } from "@/lib/skill-catalog";
import { GOOD_MATCH, STRONG_MATCH, matchStrength } from "@/lib/match-strength";

const event = { title: "Homecoming (Lumina)", start: new Date("2026-11-30T14:00:00Z"), end: new Date("2026-11-30T17:00:00Z"),
  details: "Reconnect & catch up\n\nEvent details: https://lumina.example/events/1", location: "Nairobi · Westlands" };

describe("add to calendar", () => {
  it("builds Google Calendar and Outlook.com links in UTC with encoded text", () => {
    const google = new URL(googleCalendarUrl(event));
    expect(google.origin + google.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(google.searchParams.get("action")).toBe("TEMPLATE");
    expect(google.searchParams.get("dates")).toBe("20261130T140000Z/20261130T170000Z");
    expect(google.searchParams.get("details")).toBe(event.details);
    expect(google.searchParams.get("location")).toBe(event.location);
    const outlook = new URL(outlookCalendarUrl(event));
    expect(outlook.hostname).toBe("outlook.live.com");
    expect(outlook.searchParams.get("startdt")).toBe("2026-11-30T14:00:00.000Z");
    expect(outlook.searchParams.get("subject")).toBe(event.title);
  });

  it("publishes a downloadable event with its own reminder, link and product name", () => {
    const ics = buildIcs({ uid: "event-1", start: event.start, end: event.end, method: "PUBLISH", product: "Community events",
      summary: event.title, description: event.details, location: event.location, url: "https://lumina.example/events/1", alarm: "Homecoming starts in 30 minutes" });
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("METHOD:PUBLISH");
    expect(unfolded).toContain("PRODID:-//Lumina//Community events//EN");
    expect(unfolded).toContain("URL:https://lumina.example/events/1");
    expect(unfolded).toContain("DESCRIPTION:Homecoming starts in 30 minutes");
    expect(unfolded).toContain("STATUS:CONFIRMED");
    expect(unfolded).not.toContain("ORGANIZER");
  });

  it("keeps mentoring-session invitations unchanged", () => {
    const ics = buildIcs({ uid: "s", start: event.start, end: event.end, method: "REQUEST", summary: "S", description: "D" });
    expect(ics).toContain("PRODID:-//Lumina//Mentoring sessions//EN");
    expect(ics).toContain("DESCRIPTION:Mentoring session in 30 minutes");
  });
});

describe("skills picker", () => {
  const options = sortSkills(SKILL_CATALOG);

  it("offers hundreds of skills across fields, A to Z, without duplicates", () => {
    expect(options.length).toBeGreaterThan(600);
    expect(new Set(options.map(name => name.toLowerCase())).size).toBe(options.length);
    expect([...options].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true }))).toEqual(options);
    for (const skill of ["AWS", "Accounting", "Aviation Safety", "Nursing", "Graphic Design", "Kiswahili", "Recruitment", "Supply Chain Management"]) expect(options).toContain(skill);
  });

  it("removes case-insensitive duplicates and tidies spacing", () => {
    expect(sortSkills(["python", "Python", "  Data   Analysis ", "x", "AWS"])).toEqual(["AWS", "Data Analysis", "python"]);
  });

  it("ranks names starting with the query first, then word matches, then other matches", () => {
    const results = searchSkills(["Cloud Security", "Cloud Architecture", "Information Security", "Security Operations", "Insecurity"], "secur");
    expect(results).toEqual(["Security Operations", "Cloud Security", "Information Security", "Insecurity"]);
    expect(searchSkills(options, "")).toHaveLength(options.length);
    expect(searchSkills(options, "  PYTH ")[0]).toBe("Python");
    expect(searchSkills(options, "zzzz")).toEqual([]);
  });
});

describe("match strength labels", () => {
  it("uses the evaluated bands instead of raw similarity", () => {
    expect(matchStrength(0.69)).toEqual({ label: "Strong match", level: 3 });
    expect(matchStrength(STRONG_MATCH)).toMatchObject({ label: "Strong match" });
    expect(matchStrength(0.5999)).toMatchObject({ label: "Good match" });
    expect(matchStrength(GOOD_MATCH)).toMatchObject({ label: "Good match" });
    expect(matchStrength(0.52)).toEqual({ label: "Possible match", level: 1 });
  });
});
