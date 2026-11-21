import { currentSession } from "@/lib/session";
import { buildIcs } from "@/lib/ics";
import { SESSION_MODES, sessionForCalendar } from "@/lib/sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Add to calendar" for a booked session; only its mentor and mentee can download it. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await currentSession();
  if (!auth?.user) return new Response("Sign in first.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const session = await sessionForCalendar(auth.user.id, (await params).id);
  if (!session || session.status !== "booked") return new Response("Session not found.", { status: 404, headers: { "Cache-Control": "no-store" } });
  const ics = buildIcs({ uid: session.id, start: session.starts_at, end: session.ends_at, method: "REQUEST",
    summary: `Lumina mentoring: ${session.mentor_name} & ${session.mentee_name}`,
    description: `${session.goal}${session.agenda ? `\n\nAgenda: ${session.agenda}` : ""}`, location: session.details || SESSION_MODES[session.mode] });
  return new Response(ics, { headers: {
    "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'attachment; filename="mentoring-session.ics"',
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
