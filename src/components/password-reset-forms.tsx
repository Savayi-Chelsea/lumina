"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { completePasswordReset, requestPasswordReset } from "@/app/password-actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, { message: "" });
  const [email, setEmail] = useState("");
  if (state.sent) return <div className="auth-notice-card" role="status"><h2>Check your email</h2><p>{state.message}</p><p>Didn&apos;t get it? Check your spam folder, or <button type="button" className="text-button" onClick={() => window.location.reload()}>try again</button>.</p></div>;
  return <form action={action} className="auth-form">
    <p className="auth-feedback" role="alert" hidden={!state.message}>{state.message}</p>
    <div className="field"><label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={255} value={email} onChange={event => setEmail(event.target.value)} /></div>
    <button type="submit" className="auth-submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
  </form>;
}

/**
 * The token travels in the URL fragment, which browsers never send to servers or
 * in Referer headers. It is read here, posted once, and removed from the address bar.
 */
export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(completePasswordReset, { message: "" });
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    // Reading the fragment is an external-system sync that can only happen after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(value);
    if (value) window.history.replaceState(null, "", window.location.pathname);
  }, []);
  if (token === "") return <div className="auth-notice-card" role="alert"><h2>This link is incomplete</h2><p>Open the reset link from your email again, or request a new one.</p><Link className="text-link" href="/forgot-password">Request a new link</Link></div>;
  return <form action={action} className="auth-form">
    <input type="hidden" name="token" value={token || ""} />
    <p className="auth-feedback" role="alert" hidden={!state.message}>{state.message}</p>
    <div className="field"><label htmlFor="password">New password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="password-hint" />
      <p id="password-hint" className="field-hint">At least 10 characters. A memorable phrase works well.</p></div>
    <div className="field"><label htmlFor="confirm_password">Confirm new password</label>
      <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} /></div>
    <button type="submit" className="auth-submit" disabled={pending || token === null}>{pending ? "Saving…" : "Save new password"}</button>
    {state.message.includes("Request a new one") && <Link className="text-link auth-forgot" href="/forgot-password">Request a new link</Link>}
  </form>;
}
