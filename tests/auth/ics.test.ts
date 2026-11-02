import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, fold } from "@/lib/ics";

describe("calendar invitations", () => {
  const event = { uid: "3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b", start: new Date("2026-10-24T06:30:00Z"), end: new Date("2026-10-24T07:30:00Z"),
    summary: "Lumina mentoring: Winnie & Grace", description: "Cloud careers; first steps, plan\nAgenda: CV", location: "https://meet.example.test/abc", method: "REQUEST" as const };

  it("builds a valid single-event calendar with CRLF line endings, UTC times and a reminder", () => {
    const ics = buildIcs(event);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.split("\r\n").filter(Boolean).every(line => Buffer.byteLength(line) <= 75)).toBe(true);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("METHOD:REQUEST");
    expect(unfolded).toContain("UID:3f0e5c1a-6b7d-4e2f-9a8b-1c2d3e4f5a6b@lumina");
    expect(unfolded).toContain("DTSTART:20261024T063000Z");
    expect(unfolded).toContain("DTEND:20261024T073000Z");
    expect(unfolded).toContain("DESCRIPTION:Cloud careers\\; first steps\\, plan\\nAgenda: CV");
    expect(unfolded).toContain("BEGIN:VALARM");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it("marks cancellations as cancelled without a reminder", () => {
    const ics = buildIcs({ ...event, method: "CANCEL", sequence: 1 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).not.toContain("VALARM");
  });

  it("escapes text and folds long multi-byte lines without splitting characters", () => {
    expect(escapeText("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
    const folded = fold(`SUMMARY:${"Mentoring — Ŵ ".repeat(12)}`);
    expect(folded.split("\r\n").every(line => Buffer.byteLength(line) <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"Mentoring — Ŵ ".repeat(12)}`);
  });
});
