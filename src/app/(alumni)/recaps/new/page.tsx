import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { recapPartners } from "@/lib/session-recaps";
import { DiscoveryGate } from "@/components/discovery-gate";
import { RecapForm } from "@/components/recap-form";

export const dynamic = "force-dynamic";

export default async function NewRecapPage({ searchParams }: { searchParams: Promise<{ mentorship?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to share session recaps." area="Session recaps are" />;
  const [partners, { mentorship }] = await Promise.all([recapPartners(session.user.id), searchParams]);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  return <div className="network-page">
    <section className="network-intro"><p className="eyebrow">SESSION RECAP</p><h1>Share a mentoring session</h1>
      <p>Summarise a session with your mentor or mentee. It&apos;s published on both your profiles and in Session recaps once they approve it.</p></section>
    {partners.length ? <RecapForm partners={partners} today={today} preselected={partners.some(p => p.mentorship_id === mentorship) ? mentorship : undefined} />
      : <div className="card"><p>Recaps are for accepted mentorships. Once a mentor accepts your request, or you accept a mentee, you can share how your sessions went.</p>
        <Link className="button" href="/mentorship">Find a mentor</Link></div>}
  </div>;
}
