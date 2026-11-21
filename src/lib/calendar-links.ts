/**
 * "Add to calendar" links for web calendars. Apple Calendar and desktop Outlook
 * use the .ics download instead (see src/lib/ics.ts). Times are sent in UTC so
 * each calendar shows them in the member's own time zone.
 */
export type CalendarLinkEvent = { title: string; start: Date; end: Date; details: string; location: string };

const utc = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(event: CalendarLinkEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE", text: event.title, dates: `${utc(event.start)}/${utc(event.end)}`,
    details: event.details, location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(event: CalendarLinkEvent) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose", rru: "addevent", subject: event.title,
    startdt: event.start.toISOString(), enddt: event.end.toISOString(), body: event.details, location: event.location,
  });
  return `https://outlook.live.com/calendar/0/action/compose?${params}`;
}
