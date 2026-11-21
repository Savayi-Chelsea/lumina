"use client";
import { useActionState } from "react";
import { deleteAccount } from "@/app/account/actions";

export function DeleteAccountForm({ needsPassword }: { needsPassword: boolean }) {
  const [state, action, pending] = useActionState(deleteAccount, { message: "" });
  return <form action={action} className="danger-zone">
    <p>This permanently deletes your profile, connections, messages, mentorships, recaps and sessions. It can&apos;t be undone. Download your data first if you want a copy.</p>
    {needsPassword && <div className="field"><label htmlFor="delete-password">Your password</label><input id="delete-password" name="password" type="password" autoComplete="current-password" required /></div>}
    <div className="field"><label htmlFor="delete-confirmation">Type DELETE to confirm</label><input id="delete-confirmation" name="confirmation" autoComplete="off" required pattern="DELETE" /></div>
    <p role="alert" className="auth-feedback" hidden={!state.message}>{state.message}</p>
    <button className="danger" disabled={pending}>{pending ? "Deleting…" : "Delete my account"}</button>
  </form>;
}
