import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { mySessions, SESSION_MODES, sessionWhen, type SessionRow } from "@/lib/sessions";
import { DiscoveryGate } from "@/components/discovery-gate";
import { cancelBookedSession } from "../session-actions";

export const dynamic = "force-dynamic";

const safeLink = (value: string | null) => value && /^https:\/\/[^\s<>"]+$/i.test(value) ? value : null;

function SessionCard({ session, upcoming }: { session: SessionRow; upcoming: boolean }) {
  const link = safeLink(session.details);
  return <li className="card session-card">
    <p className="eyebrow">{session.role === "mentor" ? "YOU'RE MENTORING" : "YOUR MENTOR"}</p>
    <h3><Link href={`/alumni/${session.other_profile_id}`}>{session.other_name}</Link></h3>
    <p><strong>{sessionWhen(session.starts_at, session.ends_at)}</strong> · {SESSION_MODES[session.mode]}</p>
    {session.details && <p className="small">{link ? <a className="text-link" href={link} target="_blank" rel="noopener noreferrer">Join the call</a> : session.details}</p>}
    <p className="small muted">Goal: {session.goal}{session.agenda ? ` · Agenda: ${session.agenda}` : ""}</p>
    <div className="actions">
      {upcoming ? <>
        <a className="button secondary" href={`/api/sessions/${session.id}/ics`} download>Add to calendar</a>
        <form action={cancelBookedSession}><input type="hidden" name="session_id" value={session.id} /><button className="secondary">Cancel session</button></form>
      </> : <>
        <Link className="button secondary" href={`/recaps/new?mentorship=${session.mentorship_id}`}>Share a recap</Link>
        {session.role === "mentee" && <Link className="button secondary" href="/mentorship/requests">Rate this match</Link>}
      </>}
    </div>
  </li>;
}

export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ booked?: string; cancelled?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to use mentorship." area="Mentorship is" />;
  const [{ upcoming, past, cancelled }, params] = await Promise.all([mySessions(session.user.id), searchParams]);
  return <div className="network-page">
    <section className="network-intro"><p className="eyebrow">TIME TOGETHER</p><h1>Mentoring sessions</h1>
      <p>Book time with your mentor, or offer times to your mentees. Calendar invitations are emailed to both of you.</p>
      <div className="actions"><Link className="button secondary" href="/mentorship/availability">Offer session times</Link><Link className="button secondary" href="/mentorship/requests">Your mentorships</Link></div></section>
    {params.booked && <p className="card notice" role="status">Session booked. A calendar invitation is on its way to you both.</p>}
    {params.cancelled === "1" && <p className="card notice" role="status">Session cancelled. The other person has been told.</p>}
    {params.cancelled === "0" && <p className="card notice" role="alert">That session can no longer be cancelled.</p>}
    <section className="li-section"><h2>Upcoming</h2>
      {upcoming.length ? <ul className="session-list">{upcoming.map(row => <SessionCard key={row.id} session={row} upcoming />)}</ul>
        : <p className="card muted">No sessions booked. From <Link className="text-link" href="/mentorship/requests">your mentorships</Link>, choose &ldquo;Book a session&rdquo; with your mentor.</p>}
    </section>
    {past.length > 0 && <section className="li-section"><h2>Past</h2><ul className="session-list">{past.map(row => <SessionCard key={row.id} session={row} upcoming={false} />)}</ul></section>}
    {cancelled.length > 0 && <section className="li-section"><h2>Cancelled</h2><ul className="plain-list">{cancelled.map(row =>
      <li key={row.id} className="small muted">{sessionWhen(row.starts_at, row.ends_at)} with {row.other_name}{row.cancelled_by_me ? " · cancelled by you" : ""}</li>)}</ul></section>}
  </div>;
}
