"use client";

import { useActionState } from "react";
import { askForMentorship } from "@/app/(alumni)/social-actions";

export function MentorshipRequestForm({ mentorProfileId }: { mentorProfileId: string }) {
  const [state, action, pending] = useActionState(askForMentorship, { message: "" });
  return <form action={action} className="card admin-form">
    <input type="hidden" name="mentor_profile_id" value={mentorProfileId} />
    <p className="auth-feedback" role="alert" hidden={!state.message}>{state.message}</p>
    <div className="field"><label htmlFor="goal">Your goal</label><input id="goal" name="goal" required maxLength={200} placeholder="For example: Move from IT support into cloud engineering" /></div>
    <div className="field"><label htmlFor="message">Message</label><textarea id="message" name="message" required maxLength={1000} placeholder="Introduce yourself, explain where you are now and what you'd like help with." /><p className="field-hint">Up to 1,000 characters. If they accept, this message starts your conversation.</p></div>
    <div className="actions"><button disabled={pending}>{pending ? "Sending…" : "Send request"}</button></div>
  </form>;
}
