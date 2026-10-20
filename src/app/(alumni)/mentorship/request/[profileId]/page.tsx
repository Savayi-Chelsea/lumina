import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { alumniProfile } from "@/lib/alumni-directory";
import { mentorshipWith } from "@/lib/mentorship-requests";
import { memberByProfile } from "@/lib/social";
import { DiscoveryGate } from "@/components/discovery-gate";
import { AlumniAvatar } from "@/components/alumni-avatar";
import { Icon } from "@/components/icon";
import { MentorshipRequestForm } from "@/components/mentorship-request-form";

export const dynamic = "force-dynamic";

export default async function RequestMentorshipPage({ params }: { params: Promise<{ profileId: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to use mentorship." area="Mentorship is" />;
  const { profileId } = await params;
  const mentor = await alumniProfile(profileId);
  const owner = mentor ? await memberByProfile(mentor.id) : null;
  if (!mentor || !owner || !mentor.mentorship_available || owner.user_id === session.user.id) notFound();
  const existing = await mentorshipWith(session.user.id, owner.user_id);
  const topics = (mentor.mentorship_topics || "").split("|").filter(Boolean);
  return <div className="request-page">
    <Link className="text-link back-link" href={`/alumni/${mentor.id}`}><Icon name="arrow" className="flip" />Back to {mentor.full_name}</Link>
    <p className="eyebrow">REQUEST MENTORSHIP</p><h1>Ask {mentor.full_name.split(" ")[0]} to mentor you</h1>
    <section className="card member-summary"><AlumniAvatar name={mentor.full_name} image={mentor.image} /><div><h2>{mentor.full_name}</h2><p className="muted">{mentor.headline}</p>
      {topics.length > 0 && <p className="small">Mentors on: {topics.join(" · ")}</p>}</div></section>
    {existing ? <p className="card notice" role="status">{existing.status === "pending" ? "You already have a request waiting for a reply." : "This member is already your mentor."} <Link className="text-link" href="/mentorship/requests">View your requests</Link></p>
      : <MentorshipRequestForm mentorProfileId={mentor.id} />}
  </div>;
}
