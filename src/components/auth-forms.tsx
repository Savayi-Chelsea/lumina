"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { passwordSignIn, registerAccount } from "@/app/auth-actions";

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;

function Feedback({ message }: { message: string }) {
  return <p className="auth-feedback" role="alert" hidden={!message}>{message}</p>;
}

export function SignInForm() {
  const [state, action, pending] = useActionState(passwordSignIn, { message: "" });
  const [email, setEmail] = useState("");
  return <form action={action} className="auth-form">
    <Feedback message={state.message} />
    <div className="field"><label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={255}
        value={email} onChange={event => setEmail(event.target.value)} /></div>
    <div className="field"><label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={PASSWORD_MAX * 4} /></div>
    <button type="submit" className="auth-submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    <Link className="text-link auth-forgot" href="/forgot-password">Forgot password?</Link>
  </form>;
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(registerAccount, { message: "" });
  const [values, setValues] = useState({ full_name: "", email: "" });
  return <form action={action} className="auth-form">
    <Feedback message={state.message} />
    <div className="field"><label htmlFor="full_name">Full name</label>
      <input id="full_name" name="full_name" autoComplete="name" required maxLength={150}
        value={values.full_name} onChange={event => setValues({ ...values, full_name: event.target.value })} /></div>
    <div className="field"><label htmlFor="email">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={255}
        value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} /></div>
    <div className="field"><label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" required
        minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} aria-describedby="password-hint" />
      <p id="password-hint" className="field-hint">At least {PASSWORD_MIN} characters. A memorable phrase works well.</p></div>
    <div className="field"><label htmlFor="confirm_password">Confirm password</label>
      <input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" required
        minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} /></div>
    <button type="submit" className="auth-submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
  </form>;
}
