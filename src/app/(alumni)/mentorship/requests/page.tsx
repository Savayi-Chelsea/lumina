import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { mentorshipRequests, type MentorshipRequest } from "@/lib/mentorship-requests";
import { formatDate } from "@/lib/community-input";
import { DiscoveryGate } from "@/components/discovery-gate";
import { MemberRow } from "@/components/member-row";
import { recapDrafts } from "@/lib/session-recaps";
import { myFeedback } from "@/lib/match-tracking";
import { answerMentorship, answerRecap, rateMatch, withdrawRecapDraft, withdrawRequest } from "../../social-actions";

export const dynamic = "force-dynamic";

const statusLabel: Record<MentorshipRequest["status"], string> = { pending: "Awaiting reply", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" };

const ratingNotice: Record<string, string> = { saved: "Thanks. Your rating helps Lumina improve mentor matching.", invalid: "Choose a rating and whether you'd recommend this mentor.", unavailable: "You can only rate your accepted mentorships.", failed: "Your rating couldn't be saved. Try again." };
const recapNotice: Record<string, string> = { sent: "Recap sent. It will be published once the other person approves it.", published: "Recap approved and published.", declined: "Recap declined. It won't be shared." };

function RateForm({ mentorshipId, current }: { mentorshipId: string; current?: { match_rating: number; would_recommend: boolean } }) {
  return <details className="rate-match"><summary>{current ? `You rated this match ${current.match_rating}/5 · Change` : "Rate this match"}</summary>
    <form action={rateMatch} className="rate-form"><input type="hidden" name="mentorship_id" value={mentorshipId} />
      <fieldset><legend>How good a match is this mentor for your goal?</legend><div className="rating-options">
        {[1, 2, 3, 4, 5].map(value => <label key={value}><input type="radio" name="match_rating" value={value} required defaultChecked={current?.match_rating === value} />{value}</label>)}
      </div><p className="small muted">1 = not relevant, 5 = exactly the right person</p></fieldset>
      <fieldset><legend>Would you recommend them to someone with a similar goal?</legend><div className="rating-options">
        <label><input type="radio" name="would_recommend" value="yes" required defaultChecked={current?.would_recommend === true} />Yes</label>
        <label><input type="radio" name="would_recommend" value="no" defaultChecked={current?.would_recommend === false} />No</label>
      </div></fieldset>
      <div className="field"><label htmlFor={`comment-${mentorshipId}`}>Comment (optional, private; used only to improve matching)</label><textarea id={`comment-${mentorshipId}`} name="comment" maxLength={500} rows={2} /></div>
      <button>Save rating</button></form></details>;
}

export default async function MentorshipRequestsPage({ searchParams }: { searchParams: Promise<{ sent?: string; recap?: string; rated?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to use mentorship." area="Mentorship is" />;
  const [{ incoming, outgoing }, drafts, ratings, { sent, recap, rated }] = await Promise.all([mentorshipRequests(session.user.id), recapDrafts(session.user.id), myFeedback(session.user.id), searchParams]);
  const shareRecap = (request: MentorshipRequest) => request.status === "accepted" && <Link className="button secondary" href={`/recaps/new?mentorship=${request.id}`}>Share a recap</Link>;
  return <div className="network-page">
    <section className="network-intro"><p className="eyebrow">GUIDANCE, BOTH WAYS</p><h1>Mentorship requests</h1><p>Requests you&apos;ve received as a mentor, and the ones you&apos;ve sent.</p>
      <div className="actions"><Link className="button secondary" href="/mentorship">Find a mentor</Link><Link className="button secondary" href="/mentorship/sessions">Sessions</Link><Link className="button secondary" href="/mentorship/availability">Offer session times</Link><Link className="button secondary" href="/profile/edit/mentorship">Your mentorship settings</Link></div></section>
    {sent && <p className="card notice" role="status">Request sent. You&apos;ll be notified when the mentor replies.</p>}
    {rated && ratingNotice[rated] && <p className="card notice" role="status">{ratingNotice[rated]}</p>}
    <section className="card li-section"><h2>Received ({incoming.filter(r => r.status === "pending").length} waiting)</h2>
      {incoming.length ? <ul className="member-list">{incoming.map(request => <MemberRow key={request.id} profileId={request.other_profile_id} name={request.other_name} image={request.other_image}
        detail={`${request.goal} · ${formatDate(request.created_at)} · ${statusLabel[request.status]}`}>
        {request.status === "pending" && <>
          <details className="request-message"><summary>Read message</summary><p>{request.message}</p></details>
          <form action={answerMentorship}><input type="hidden" name="request_id" value={request.id} /><button className="secondary" name="decision" value="decline">Decline</button></form>
          <form action={answerMentorship}><input type="hidden" name="request_id" value={request.id} /><button name="decision" value="accept">Accept</button></form>
        </>}
        {shareRecap(request)}
      </MemberRow>)}</ul> : <p className="muted">No requests yet. Turn on mentorship in your settings to appear in mentor search.</p>}
    </section>
    <section className="card li-section"><h2>Sent</h2>
      {outgoing.length ? <ul className="member-list">{outgoing.map(request => <MemberRow key={request.id} profileId={request.other_profile_id} name={request.other_name} image={request.other_image}
        detail={`${request.goal} · ${formatDate(request.created_at)} · ${statusLabel[request.status]}`}>
        {request.status === "pending" && <form action={withdrawRequest}><input type="hidden" name="request_id" value={request.id} /><button className="secondary">Withdraw</button></form>}
        {shareRecap(request)}
        {request.status === "accepted" && <Link className="button" href={`/mentorship/sessions/book/${request.id}`}>Book a session</Link>}
        {request.status === "accepted" && <RateForm mentorshipId={request.id} current={ratings.get(request.id)} />}
      </MemberRow>)}</ul> : <p className="muted">You haven&apos;t requested a mentor yet. Describe your goal in mentor search to find one.</p>}
    </section>
    <section className="card li-section" id="recaps"><div className="li-section-head"><h2>Session recaps</h2><Link className="text-link" href="/recaps">See all recaps</Link></div>
      {recap && recapNotice[recap] && <p className="notice" role="status">{recapNotice[recap]}</p>}
      <h3>Waiting for your approval</h3>
      {drafts.toReview.length ? <ul className="recap-drafts">{drafts.toReview.map(draft => <li key={draft.id} className="recap-draft">
        <p className="small muted">From {draft.other_profile_id ? <Link href={`/alumni/${draft.other_profile_id}`}>{draft.other_name}</Link> : draft.other_name} · Session on {formatDate(`${draft.session_date}T12:00:00Z`)}</p>
        <h4>{draft.topic}</h4><p>{draft.takeaways}</p>
        <div className="actions">
          <form action={answerRecap}><input type="hidden" name="recap_id" value={draft.id} /><button className="secondary" name="decision" value="decline">Decline</button></form>
          <form action={answerRecap}><input type="hidden" name="recap_id" value={draft.id} /><button name="decision" value="approve">Approve and publish</button></form>
        </div></li>)}</ul> : <p className="muted">Nothing to approve.</p>}
      <h3>Your recaps</h3>
      {drafts.mine.length ? <ul className="recap-drafts">{drafts.mine.map(draft => <li key={draft.id} className="recap-draft">
        <p className="small muted">With {draft.other_name} · {draft.status === "pending" ? "Awaiting their approval" : "Declined"}</p>
        <h4>{draft.topic}</h4>
        {draft.status === "pending" && <form action={withdrawRecapDraft}><input type="hidden" name="recap_id" value={draft.id} /><button className="secondary">Withdraw</button></form>}
      </li>)}</ul> : <p className="muted">After a session, share a recap from an accepted mentorship above.</p>}
    </section>
  </div>;
}
