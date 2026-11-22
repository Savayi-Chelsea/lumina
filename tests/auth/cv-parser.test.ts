import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cvLines, parseCv } from "@/lib/cv-parser";

const today = new Date("2026-11-22T09:00:00Z");
const fixture = (name: string) => readFileSync(`tests/fixtures/cv/${name}`, "utf8");

describe("CV import: a typical CV", () => {
  const cv = parseCv(fixture("grace-cv.txt"), today);

  it("reads the name, headline, location and summary from the top of the CV", () => {
    expect(cv.name).toBe("Grace Muthoni");
    expect(cv.headline).toBe("Cloud Engineer | AWS Certified Solutions Architect – Associate");
    expect(cv.location).toBe("Nairobi, Kenya");
    expect(cv.summary).toMatch(/^Cloud engineer with eleven years in IT/);
    expect(cv.summary).not.toContain("WORK EXPERIENCE");
  });

  it("reads every role with its organization, month-precise dates and bullet description, newest first", () => {
    expect(cv.experience.map(entry => [entry.title, entry.organization, entry.start, entry.end, entry.current])).toEqual([
      ["Cloud Engineer", "CloudWorks Africa", "2023-01", null, true],
      ["Systems Administrator", "Kenya Airways", "2018-03", "2022-12", false],
      ["IT Support Officer", "Safaricom PLC", "2014-06", "2018-02", false],
    ]);
    expect(cv.experience[1].description).toBe("• Administered 140 Linux and Windows Server hosts for airport and crew systems\n• Led the migration of the crew rostering system to a hybrid cloud");
    expect(cv.experience[2].description).not.toContain("BSc Computer Science");
    expect(cv.currentTitle).toBe("Cloud Engineer");
    expect(cv.currentOrganization).toBe("CloudWorks Africa");
    expect(cv.industry).toBe("Technology");
  });

  it("suggests the Kenya Airways chapter, with a department inferred from the KQ role", () => {
    expect(cv.kq).toEqual({ role: "Systems Administrator", department: "ICT / Digital", startYear: 2018, endYear: 2022 });
  });

  it("lists skills from the Skills section first, using the catalog's spelling, then skills found in the text", () => {
    expect(cv.skills.slice(0, 10)).toEqual(["AWS", "Terraform", "Linux Administration", "Kubernetes", "Python", "Networking", "ITIL", "Docker", "CI/CD", "Incident Response"]);
    expect(cv.skills).toEqual(expect.arrayContaining(["Active Directory", "Windows Server"]));
    expect(new Set(cv.skills.map(skill => skill.toLowerCase())).size).toBe(cv.skills.length);
  });
});

describe("CV import: LinkedIn's Save to PDF export", () => {
  const cv = parseCv(fixture("linkedin-export.txt"), today);

  it("finds the name, headline and location after LinkedIn's side column", () => {
    expect(cv.name).toBe("Brian Otieno");
    expect(cv.headline).toBe("Commercial Analytics Lead at Meridian Logistics | Ex-Kenya Airways");
    expect(cv.location).toBe("Mombasa, Mombasa County, Kenya");
  });

  it("reads company-then-title headers and several roles under one employer", () => {
    expect(cv.experience.map(entry => [entry.title, entry.organization, entry.start, entry.end])).toEqual([
      ["Commercial Analytics Lead", "Meridian Logistics", "2021-02", null],
      ["Revenue Management Analyst", "Kenya Airways", "2016-04", "2021-01"],
      ["Pricing Analyst", "Kenya Airways", "2013-05", "2016-03"],
    ]);
    expect(cv.experience[0].description).toBe("Built the pricing model used for 60% of contract freight.");
    expect(cv.kq).toEqual({ role: "Revenue Management Analyst", department: "Finance", startYear: 2013, endYear: 2021 });
    expect(cv.skills.slice(0, 3)).toEqual(["Revenue Management", "Pricing Strategy", "Data Analysis"]);
  });
});

describe("CV import: other layouts and edge cases", () => {
  it("reads one-line role headers in several styles", () => {
    const cv = parseCv([
      "Amina Wanjiru", "Experience",
      "Cabin Crew Supervisor | Kenya Airways | Jan 2010 – Aug 2019",
      "Led cabin teams of 12 on long-haul flights",
      "Customer Experience Manager at Serena Hotels, Sep 2019 - Present",
      "Kenya Airways, Flight Attendant, 2006 to 2009",
    ].join("\n"), today);
    expect(cv.experience.map(entry => [entry.title, entry.organization, entry.start, entry.end, entry.current])).toEqual([
      ["Customer Experience Manager", "Serena Hotels", "2019-09", null, true],
      ["Cabin Crew Supervisor", "Kenya Airways", "2010-01", "2019-08", false],
      ["Flight Attendant", "Kenya Airways", "2006-01", "2009-12", false],
    ]);
    expect(cv.experience[1].description).toBe("Led cabin teams of 12 on long-haul flights");
    expect(cv.kq).toMatchObject({ role: "Cabin Crew Supervisor", department: "Cabin Services", startYear: 2006, endYear: 2019 });
    expect(cv.headline).toBe("Customer Experience Manager at Serena Hotels");
  });

  it("never suggests dates in the future or ranges that end before they start", () => {
    const cv = parseCv("Work history\nEngineer\nAcme Ltd\n03/2025 - 12/2027\nTechnician\nBeta Ltd\n2020 - 2018", today);
    expect(cv.experience).toEqual([expect.objectContaining({ title: "Engineer", start: "2025-03", end: "2026-11" })]);
  });

  it("does not turn ordinary words into skills, and keeps unlisted skills from a Skills section", () => {
    const cv = parseCv("Profile\nI go the extra mile and drive swift results.\nSkills\nGo, Crew Rostering, Swift", today);
    expect(cv.skills).toEqual(["Go", "Crew Rostering", "Swift"]);
    expect(parseCv("Summary\nI go the extra mile with swift results.", today).skills).toEqual([]);
  });

  it("handles text with no recognisable content", () => {
    expect(parseCv("", today)).toEqual({ name: null, headline: null, location: null, summary: null, currentTitle: null, currentOrganization: null, industry: null, experience: [], skills: [], kq: null });
    expect(parseCv("lorem ipsum dolor", today).experience).toEqual([]);
  });

  it("normalises bullets, spacing and page footers", () => {
    expect(cvLines("  •\tFirst point \r\n \nPage 2 of 3\n- Second   point\n1. Third")).toEqual([
      { text: "First point", bullet: true }, { text: "Second point", bullet: true }, { text: "Third", bullet: true },
    ]);
  });
});
