import { pendingRequests } from "@/lib/verification";
import { reviewVerification } from "./actions";

export default async function VerificationPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const requests = await pendingRequests();
  const { result } = await searchParams;
  const messages: Record<string, string> = {
    verified: "Registry record associated. The account is now active and verified.",
    closed_unresolved: "Request closed unresolved. The account and verification status are unchanged; the user can retry or request assistance again.",
    stale: "No change was made. The request may be resolved, the account ineligible, or the registry record unavailable.",
    invalid: "Check the request. Registry association requires a staff number and explicit confirmation.",
    failed: "The resolution could not be saved. Check the synthetic staff number, refresh and try again.",
  };
  return <>
    <p className="eyebrow">Admin / Verification exceptions</p>
    <h1>Verification assistance</h1>
    <p>Normal signups verify automatically against the synthetic registry. Only users who explicitly request assistance appear here.</p>
    {result && messages[result] && <p className="card notice" role="status">{messages[result]}</p>}
    <p className="muted">These are fictional prototype records. Associate an available registry record only after establishing the correct fixture with the requester. Closing unresolved never suspends, rejects, or deletes the account. No free-text notes are collected.</p>
    {!requests.length && <section className="card"><h2>All caught up</h2><p>No open assistance requests.</p></section>}
    {requests.map(request => <article className="card request" key={request.id}>
      <h2>{request.full_name || "Profile not yet created"}</h2>
      <p>{request.email}</p>
      <p><span className="badge">Assistance requested</span> · Account: {request.account_status}</p>
      <p className="muted">Requested {new Date(request.requested_at).toISOString().slice(0, 10)}</p>
      <form action={reviewVerification}>
        <input type="hidden" name="user_id" value={request.id} />
        <div className="field">
          <label htmlFor={`staff-${request.id}`}>Confirmed synthetic staff number</label>
          <input id={`staff-${request.id}`} name="staff_number" placeholder="SYN-ALUM-001" maxLength={40} required />
        </div>
        <label className="confirmation"><input type="checkbox" name="confirm_association" value="yes" required /> I have confirmed this is the correct synthetic registry record for the requester.</label>
        <div className="actions"><button name="outcome" value="verified">Associate record and verify</button></div>
      </form>
      <form action={reviewVerification} className="actions">
        <input type="hidden" name="user_id" value={request.id} />
        <button className="secondary" name="outcome" value="closed_unresolved">Close unresolved — keep account available</button>
      </form>
    </article>)}
  </>;
}
