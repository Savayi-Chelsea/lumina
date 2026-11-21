import "server-only";
import { database } from "@/lib/db";
import { applicationOrigin } from "@/lib/application-origin";
import { buildIcs } from "@/lib/ics";
import { isEmailConfigured, sendMail } from "@/lib/mailer";
import { SESSION_MODES, sessionForCalendar, sessionWhen } from "@/lib/sessions";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

/**
 * Emails both people about a booked or cancelled session, with a calendar
 * invitation (or cancellation) attached. Respects each person's "session
 * emails" choice; the delivery ledger guarantees one email per person per event.
 */
export async function sendSessionEmails(sessionId: string, kind: "booked" | "cancelled") {
  if (!isEmailConfigured()) return 0;
  const session = await sessionForCalendar(null, sessionId);
  if (!session) return 0;
  const people = [
    // `role` describes the other person, as seen by the recipient.
    { id: session.mentor_id, email: session.mentor_email, other: session.mentee_name, role: "mentee" },
    { id: session.mentee_id, email: session.mentee_email, other: session.mentor_name, role: "mentor" },
  ];
  const when = sessionWhen(session.starts_at, session.ends_at);
  const mode = SESSION_MODES[session.mode];
  const link = `${applicationOrigin()}/mentorship/sessions`;
  let sent = 0;
  for (const person of people) {
    if (person.email.endsWith("@synthetic.lumina.local")) continue; // seeded profiles cannot receive mail
    const wants = (await database().query<{ session_emails: boolean }>("SELECT session_emails FROM email_preferences WHERE user_id = $1", [person.id])).rows[0];
    if (wants && !wants.session_emails) continue;
    const claimed = await database().query(`INSERT INTO email_deliveries (user_id, kind, reference) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, kind, reference) DO NOTHING RETURNING id`, [person.id, `session_${kind}`, sessionId]);
    if (!claimed.rowCount) continue;
    const subject = kind === "booked" ? `Mentoring session with ${person.other}: ${when}` : `Cancelled: mentoring session with ${person.other}`;
    const lines = kind === "booked"
      ? [`Your mentoring session with ${person.other} (your ${person.role}) is booked.`, "", `When: ${when}`, `How: ${mode}`,
        ...(session.details ? [`Where: ${session.details}`] : []), ...(session.agenda ? ["", `Agenda: ${session.agenda}`] : []),
        "", `Goal: ${session.goal}`, "", `Manage your sessions: ${link}`]
      : [`Your mentoring session with ${person.other} on ${when} was cancelled.`, "", `See your sessions or book another time: ${link}`];
    try {
      await sendMail({
        to: person.email, subject, text: lines.join("\n"),
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#292529"><h1 style="font-family:Georgia,serif;font-weight:500;color:#481729">${escapeHtml(subject)}</h1>`
          + lines.filter(Boolean).map(line => `<p>${escapeHtml(line)}</p>`).join("") + "</div>",
        icalEvent: {
          method: kind === "booked" ? "REQUEST" : "CANCEL", filename: "mentoring-session.ics",
          content: buildIcs({ uid: session.id, start: session.starts_at, end: session.ends_at, method: kind === "booked" ? "REQUEST" : "CANCEL",
            sequence: kind === "booked" ? 0 : 1, summary: `Lumina mentoring: ${session.mentor_name} & ${session.mentee_name}`,
            description: `${session.goal}${session.agenda ? `\n\nAgenda: ${session.agenda}` : ""}\n\n${link}`,
            location: session.details || mode }),
        },
      });
      sent++;
    } catch {
      // Release the claim so a later retry can send it.
      await database().query("DELETE FROM email_deliveries WHERE user_id = $1 AND kind = $2 AND reference = $3", [person.id, `session_${kind}`, sessionId]);
    }
  }
  return sent;
}
