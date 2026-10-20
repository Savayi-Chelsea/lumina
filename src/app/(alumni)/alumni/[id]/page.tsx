import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors, profileIdPattern } from "@/lib/mentorship-contract";
import { alumniProfile, relatedAlumni } from "@/lib/alumni-directory";
import { networkReturn, type SearchParameters } from "@/lib/network-query";
import { connectionCount, connectionState, memberByProfile } from "@/lib/social";
import { canMessage } from "@/lib/messages";
import { mentorshipWith } from "@/lib/mentorship-requests";
import { database } from "@/lib/db";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";
import { PeopleList, ProfileView } from "@/components/profile-view";
import { answerConnection, connect, startConversation } from "../../social-actions";

export const dynamic = "force-dynamic";

const connectMessages: Record<string, string> = {
  sent: "Invitation sent.", accepted: "You're now connected.", already: "You're already connected or have a pending invitation.",
  unavailable: "This member can't be invited right now.", failed: "Something went wrong. Please try again.",
};

export default async function AlumniProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParameters> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate />;
  const { id } = await params;
  if (!profileIdPattern.test(id)) notFound();
  const profile = await alumniProfile(id);
  if (!profile) notFound();
  const query = (await searchParams) || {};
  const from = typeof query.from === "string" ? query.from : undefined;
  const backHref = from === "mentorship" ? "/mentorship" : from === "connections" ? "/network/connections" : networkReturn(from);
  // The owner's internal id is resolved on the server and never rendered.
  const owner = await memberByProfile(profile.id);
  if (!owner) notFound();
  const self = owner.user_id === session.user.id;
  const [relation, connections, messaging, mentorship, related] = await Promise.all([
    connectionState(session.user.id, owner.user_id), connectionCount(owner.user_id),
    canMessage(database(), session.user.id, owner.user_id), mentorshipWith(session.user.id, owner.user_id),
    relatedAlumni(profile.id, profile.former_kq_department),
  ]);
  const returnTo = `/alumni/${profile.id}`;
  const connectNotice = typeof query.connect === "string" ? connectMessages[query.connect] : undefined;
  const actions = self ? <Link className="button secondary" href="/profile">View your profile</Link> : <>
    {relation.state === "none" && <form action={connect}><input type="hidden" name="profile_id" value={profile.id} /><input type="hidden" name="return_to" value={returnTo} /><button><Icon name="plus" width={16} height={16} />Connect</button></form>}
    {relation.state === "outgoing" && <button className="secondary" disabled>Invitation sent</button>}
    {relation.state === "incoming" && relation.id && <form action={answerConnection}><input type="hidden" name="connection_id" value={relation.id} /><input type="hidden" name="return_to" value={returnTo} /><button name="decision" value="accept">Accept invitation</button></form>}
    {relation.state === "connected" && <span className="badge"><Icon name="check" width={14} height={14} />Connected</span>}
    {messaging && <form action={startConversation}><input type="hidden" name="profile_id" value={profile.id} /><input type="hidden" name="return_to" value={returnTo} /><button className="secondary"><Icon name="message" width={16} height={16} />Message</button></form>}
    {profile.mentorship_available && (mentorship
      ? <span className="badge">{mentorship.status === "pending" ? "Mentorship requested" : "Your mentor"}</span>
      : <Link className="button secondary" href={`/mentorship/request/${profile.id}`}>Request mentorship</Link>)}
  </>;
  return <>
    <Link className="text-link back-link" href={backHref}><Icon name="arrow" className="flip" />{from === "mentorship" ? "Back to mentorship" : from === "connections" ? "Back to My network" : "Back to Network"}</Link>
    <ProfileView profile={profile} connections={connections} actions={actions}
      notice={connectNotice ? <p className="card notice" role="status">{connectNotice}</p> : undefined}
      sidebar={<PeopleList title="People also viewed" people={related} />} />
  </>;
}
