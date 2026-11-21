import { describe, expect, it } from "vitest";
import { explainMatch, terms } from "@/lib/match-explanation";

const mentor = {
  skills: ["AWS", "Docker", "Financial Reporting"], mentorship_topics: "Cloud engineering|Moving into technology from aviation",
  current_job_title: "Cloud Engineer", current_organization: "CloudWorks Africa", industry: "Technology",
  former_kq_role: "Systems Administrator", former_kq_department: "ICT / Digital",
};

describe("grounded match explanations", () => {
  it("cites only skills, topics and roles that overlap with the request", () => {
    const reasons = explainMatch("I want to move from IT support into AWS cloud engineering and Docker", mentor);
    expect(reasons[0]).toBe("Skilled in AWS, Docker");
    expect(reasons[1]).toBe("Mentors on Cloud engineering");
    expect(reasons[2]).toBe("Works as Cloud Engineer at CloudWorks Africa (Technology)");
    expect(reasons.join(" ")).not.toContain("Financial Reporting");
  });

  it("falls back to stated facts, never invented overlap, when no words are shared", () => {
    expect(explainMatch("leadership under pressure", mentor)).toEqual(["Now Cloud Engineer at CloudWorks Africa", "Previously Systems Administrator in ICT / Digital"]);
  });

  it("returns at most three reasons and tolerates sparse profiles", () => {
    expect(explainMatch("aws docker cloud engineer systems", mentor).length).toBeLessThanOrEqual(3);
    expect(explainMatch("anything", { skills: undefined as unknown as string[], mentorship_topics: null, current_job_title: null, current_organization: null, industry: null, former_kq_role: null, former_kq_department: null })).toEqual([]);
  });

  it("normalizes words and ignores filler", () => {
    expect([...terms("How can I become a Pilot? Flying planes!")]).toEqual(["pilot", "fly", "plan"]);
  });
});
