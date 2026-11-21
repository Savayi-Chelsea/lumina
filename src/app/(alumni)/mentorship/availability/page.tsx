import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { mySlots, nairobiDay, SESSION_MODES, sessionWhen } from "@/lib/sessions";
import { DiscoveryGate } from "@/components/discovery-gate";
import { SlotForm } from "@/components/session-forms";
import { withdrawSlot } from "../session-actions";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to use mentorship." area="Mentorship is" />;
  const slots = await mySlots(session.user.id);
  return <div className="network-page">
    <section className="network-intro"><p className="eyebrow">FOR MENTORS</p><h1>Offer session times</h1>
      <p>Publish times you&apos;re free. Your mentees choose one and you both get a calendar invitation. Times are in Nairobi time.</p>
      <div className="actions"><Link className="button secondary" href="/mentorship/sessions">Your sessions</Link></div></section>
    <SlotForm minDate={nairobiDay(0)} maxDate={nairobiDay(90)} />
    <section className="li-section"><h2>Your upcoming slots</h2>
      {slots.length ? <ul className="session-list">{slots.map(slot => <li key={slot.id} className="card session-card">
        <p><strong>{sessionWhen(slot.starts_at, slot.ends_at)}</strong> · {SESSION_MODES[slot.mode]}</p>
        {slot.status === "booked" ? <p className="small">Booked by {slot.mentee_profile_id ? <Link className="text-link" href={`/alumni/${slot.mentee_profile_id}`}>{slot.mentee_name}</Link> : slot.mentee_name}{slot.agenda ? ` · ${slot.agenda}` : ""}. Cancel it from <Link className="text-link" href="/mentorship/sessions">your sessions</Link>.</p>
          : <form action={withdrawSlot}><input type="hidden" name="slot_id" value={slot.id} /><span className="badge">Open</span> <button className="secondary">Remove</button></form>}
      </li>)}</ul> : <p className="card muted">No upcoming slots. Add one above.</p>}
    </section>
  </div>;
}
