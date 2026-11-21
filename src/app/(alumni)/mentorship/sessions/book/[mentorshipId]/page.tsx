import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { bookableSlots, sessionWhen } from "@/lib/sessions";
import { DiscoveryGate } from "@/components/discovery-gate";
import { BookForm } from "@/components/session-forms";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

export default async function BookSessionPage({ params }: { params: Promise<{ mentorshipId: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to use mentorship." area="Mentorship is" />;
  const data = await bookableSlots(session.user.id, (await params).mentorshipId);
  if (!data) notFound();
  const first = data.mentor_name.split(" ")[0];
  return <div className="network-page">
    <Link className="text-link back-link" href="/mentorship/requests"><Icon name="arrow" className="flip" />Back to your mentorships</Link>
    <section className="network-intro"><p className="eyebrow">BOOK A SESSION</p><h1>Meet with {data.mentor_name}</h1><p>Goal: {data.goal}</p></section>
    {data.slots.length ? <BookForm mentorshipId={(await params).mentorshipId} slots={data.slots.map(slot => ({ id: slot.id, mode: slot.mode, label: sessionWhen(slot.starts_at, slot.ends_at) }))} />
      : <div className="card"><p>{first} hasn&apos;t published any free times yet. Send a message to suggest one.</p><Link className="button secondary" href="/messages">Go to messages</Link></div>}
  </div>;
}
