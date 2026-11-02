/**
 * Minimal iCalendar (RFC 5545) event for a booked mentoring session: one
 * VEVENT in UTC, escaped text, lines folded at 75 octets, CRLF line endings.
 */
export type CalendarEvent = {
  uid: string; start: Date; end: Date; summary: string; description: string; location?: string | null;
  method: "REQUEST" | "CANCEL"; sequence?: number; organizer?: string | null;
};

const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export const escapeText = (value: string) => value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Folds a content line so no physical line exceeds 75 octets (UTF-8 safe). */
export function fold(line: string) {
  const out: string[] = [];
  let current = "", size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (size + bytes > (out.length ? 74 : 75)) { out.push(current); current = ""; size = 0; }
    current += char; size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(event: CalendarEvent) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lumina//Mentoring sessions//EN", "CALSCALE:GREGORIAN", `METHOD:${event.method}`,
    "BEGIN:VEVENT", `UID:${event.uid}@lumina`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`,
    `SEQUENCE:${event.sequence ?? 0}`, `STATUS:${event.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(event.summary)}`, `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.organizer ? [`ORGANIZER:mailto:${event.organizer}`] : []),
    ...(event.method === "REQUEST" ? ["BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Mentoring session in 30 minutes", "END:VALARM"] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
