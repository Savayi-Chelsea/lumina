import { describe, expect, it } from "vitest";
import { CommunityInputError, eatDateTime, eventWhen, parseEvent, parseEventFilters, parseOpportunity, parseOpportunityFilters, publicationIntent, toEatInput } from "@/lib/community-input";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const event = { title: " Homecoming ", summary: "Catch up", description: "Line one\nLine two", category: "Reunion", format: "in_person", location: "Nairobi", starts_at: "2030-03-01T17:00", ends_at: "2030-03-01T20:00", capacity: "" };
const opportunity = { title: "Advisor", organization: "Example Org", opportunity_type: "Advisory", work_mode: "hybrid", location: "Nairobi", industry: "", summary: "Advise", description: "Details", how_to_apply: "Send a note", closes_on: "" };

describe("event input", () => {
  it("parses East Africa Time into UTC instants and trims text", () => {
    expect(parseEvent(form(event))).toMatchObject({ title: "Homecoming", starts_at: "2030-03-01T14:00:00.000Z", ends_at: "2030-03-01T17:00:00.000Z", capacity: null, description: "Line one\nLine two" });
    expect(parseEvent(form({ ...event, capacity: "40" })).capacity).toBe(40);
  });

  it("round-trips editor values", () => {
    expect(toEatInput(eatDateTime("2030-03-01T17:00", "Start"))).toBe("2030-03-01T17:00");
  });

  it.each([
    [{ title: "" }, "Title is required"],
    [{ title: "x".repeat(151) }, "150 characters"],
    [{ category: "Party" }, "valid category"],
    [{ format: "telepathy" }, "valid format"],
    [{ starts_at: "tomorrow" }, "Start is required"],
    [{ ends_at: "2030-03-01T16:00" }, "End must be after"],
    [{ capacity: "0" }, "Capacity"],
    [{ capacity: "12.5" }, "Capacity"],
    [{ location: "Nairobi\u0000" }, "unsupported"],
  ])("rejects %o", (override, message) => {
    expect(() => parseEvent(form({ ...event, ...override }))).toThrow(message);
    expect(() => parseEvent(form({ ...event, ...override }))).toThrow(CommunityInputError);
  });

  it("formats event times in Nairobi", () => {
    expect(eventWhen("2030-03-01T14:00:00Z", "2030-03-01T17:00:00Z")).toBe("Fri, 1 Mar 2030, 17:00 – 20:00 EAT");
  });
});

describe("opportunity input", () => {
  it("parses optional fields as null", () => {
    expect(parseOpportunity(form(opportunity))).toMatchObject({ industry: null, closes_on: null, opportunity_type: "Advisory" });
    expect(parseOpportunity(form({ ...opportunity, closes_on: "2030-05-01" })).closes_on).toBe("2030-05-01");
  });
  it("rejects invalid types, modes and dates", () => {
    expect(() => parseOpportunity(form({ ...opportunity, opportunity_type: "Gig" }))).toThrow("valid type");
    expect(() => parseOpportunity(form({ ...opportunity, work_mode: "space" }))).toThrow("valid work mode");
    expect(() => parseOpportunity(form({ ...opportunity, closes_on: "soon" }))).toThrow("Closing date");
    expect(() => parseOpportunity(form({ ...opportunity, how_to_apply: " " }))).toThrow("How to apply is required");
  });
});

describe("filters and publication intent", () => {
  it("ignores unknown filter values instead of querying them", () => {
    expect(parseEventFilters({ view: "past", format: "online" })).toEqual({ view: "past", format: "online" });
    expect(parseEventFilters({ view: "future", format: "' OR 1=1" })).toEqual({ view: "upcoming", format: null });
    expect(parseOpportunityFilters({ type: "Job", q: "  cloud " })).toEqual({ type: "Job", q: "cloud" });
    expect(parseOpportunityFilters({ type: ["Job", "Volunteer"], q: "x".repeat(300) })).toEqual({ type: null, q: "x".repeat(100) });
  });
  it("accepts only known publication states", () => {
    expect(publicationIntent(form({ intent: "published" }))).toBe("published");
    expect(() => publicationIntent(form({ intent: "deleted" }))).toThrow(CommunityInputError);
  });
});
