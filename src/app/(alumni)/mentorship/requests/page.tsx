import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { mentorshipRequests, type MentorshipRequest } from "@/lib/mentorship-requests";
import { formatDate } from "@/lib/community-input";
import { DiscoveryGate } from "@/components/discovery-gate";
import { MemberRow } from "@/components/member-row";
import { answerMentorship, withdrawRequest } from "../../social-actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<MentorshipRequest["status"], string> = { pending: "Awaiting reply", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" };

export default async function MentorshipRequestsPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to use mentorship." area="Mentorship is" />;
  const [{ incoming, outgoing }, { sent }] = await Promise.all([mentorshipRequests(session.user.id), searchParams]);
  return <div className="network-page">
    <section className="network-intro"><p className="eyebrow">GUIDANCE, BOTH WAYS</p><h1>Mentorship requests</h1><p>Requests you&apos;ve received as a mentor, and the ones you&apos;ve sent.</p>
      <div className="actions"><Link className="button secondary" href="/mentorship">Find a mentor</Link><Link className="button secondary" href="/profile/edit/mentorship">Your mentorship settings</Link></div></section>
    {sent && <p className="card notice" role="status">Request sent. You&apos;ll be notified when the mentor replies.</p>}
    <section className="card li-section"><h2>Received ({incoming.filter(r => r.status === "pending").length} waiting)</h2>
      {incoming.length ? <ul className="member-list">{incoming.map(request => <MemberRow key={request.id} profileId={request.other_profile_id} name={request.other_name} image={request.other_image}
        detail={`${request.goal} · ${formatDate(request.created_at)} · ${statusLabel[request.status]}`}>
        {request.status === "pending" && <>
          <details className="request-message"><summary>Read message</summary><p>{request.message}</p></details>
          <form action={answerMentorship}><input type="hidden" name="request_id" value={request.id} /><button className="secondary" name="decision" value="decline">Decline</button></form>
          <form action={answerMentorship}><input type="hidden" name="request_id" value={request.id} /><button name="decision" value="accept">Accept</button></form>
        </>}
      </MemberRow>)}</ul> : <p className="muted">No requests yet. Turn on mentorship in your settings to appear in mentor search.</p>}
    </section>
    <section className="card li-section"><h2>Sent</h2>
      {outgoing.length ? <ul className="member-list">{outgoing.map(request => <MemberRow key={request.id} profileId={request.other_profile_id} name={request.other_name} image={request.other_image}
        detail={`${request.goal} · ${formatDate(request.created_at)} · ${statusLabel[request.status]}`}>
        {request.status === "pending" && <form action={withdrawRequest}><input type="hidden" name="request_id" value={request.id} /><button className="secondary">Withdraw</button></form>}
      </MemberRow>)}</ul> : <p className="muted">You haven&apos;t requested a mentor yet. Describe your goal in mentor search to find one.</p>}
    </section>
  </div>;
}
