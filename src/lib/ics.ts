/**
 * Minimal iCalendar (RFC 5545) event for a booked mentoring session or a
 * community event: one VEVENT in UTC, escaped text, lines folded at 75 octets,
 * CRLF line endings. REQUEST/CANCEL are emailed invitations; PUBLISH is a plain
 * "Add to calendar" download.
 */
export type CalendarEvent = {
  uid: string; start: Date; end: Date; summary: string; description: string; location?: string | null;
  method: "REQUEST" | "CANCEL" | "PUBLISH"; sequence?: number; organizer?: string | null;
  /** Reminder text, shown 30 minutes before the start (not on cancellations). */
  alarm?: string; url?: string | null; product?: string;
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
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//Lumina//${event.product ?? "Mentoring sessions"}//EN`, "CALSCALE:GREGORIAN", `METHOD:${event.method}`,
    "BEGIN:VEVENT", `UID:${event.uid}@lumina`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(event.start)}`, `DTEND:${stamp(event.end)}`,
    `SEQUENCE:${event.sequence ?? 0}`, `STATUS:${event.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    `SUMMARY:${escapeText(event.summary)}`, `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.organizer ? [`ORGANIZER:mailto:${event.organizer}`] : []),
    ...(event.method !== "CANCEL" ? ["BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.alarm ?? "Mentoring session in 30 minutes")}`, "END:VALARM"] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
