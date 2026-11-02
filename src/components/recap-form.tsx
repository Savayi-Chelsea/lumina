"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { shareRecap } from "@/app/(alumni)/social-actions";
import type { RecapPartner } from "@/lib/session-recaps";

const TAKEAWAYS_MAX = 1500;

export function RecapForm({ partners, today, preselected }: { partners: RecapPartner[]; today: string; preselected?: string }) {
  const [state, action, pending] = useActionState(shareRecap, { message: "" });
  const [length, setLength] = useState(0);
  return <form action={action} className="card profile-edit-form">
    <div className="field"><label htmlFor="mentorship_id">Session with</label>
      <select id="mentorship_id" name="mentorship_id" required defaultValue={preselected || ""}>
        <option value="" disabled>Choose a mentorship</option>
        {partners.map(partner => <option key={partner.mentorship_id} value={partner.mentorship_id}>{partner.name} ({partner.role === "mentor" ? "your mentor" : "your mentee"}) · {partner.goal}</option>)}
      </select></div>
    <div className="grid">
      <div className="field"><label htmlFor="topic">Topic</label><input id="topic" name="topic" maxLength={120} required placeholder="For example: Preparing for a cloud certification" /></div>
      <div className="field"><label htmlFor="session_date">Session date</label><input id="session_date" name="session_date" type="date" max={today} required /></div>
    </div>
    <div className="field"><label htmlFor="takeaways">What you covered and took away</label>
      <textarea id="takeaways" name="takeaways" maxLength={TAKEAWAYS_MAX} minLength={20} required rows={6} onChange={event => setLength(event.target.value.length)}
        placeholder="Keep it to what you're both happy to share publicly: the questions you worked through and what helped." aria-describedby="takeaways-count" />
      <p id="takeaways-count" className="small muted">{length}/{TAKEAWAYS_MAX}</p></div>
    <p className="small muted">The other person approves the recap before anyone else sees it.</p>
    <p role="status" aria-live="polite">{state.message}</p>
    <div className="actions"><button disabled={pending}>{pending ? "Sending…" : "Send for approval"}</button><Link className="button secondary" href="/mentorship/requests">Cancel</Link></div>
  </form>;
}
