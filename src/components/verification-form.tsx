"use client";

import { useActionState, useState } from "react";
import { submitAssistance, submitVerification } from "@/app/(alumni)/verify/actions";

export function VerificationForm() {
  const [state, action, pending] = useActionState(submitVerification, { message: "" });
  const [values, setValues] = useState({ staff_number: "", surname: "", department: "", start_year: "", end_year: "" });
  const fields = [
    ["staff_number", "Synthetic staff number"], ["surname", "Surname"],
    ["department", "Former KQ department"], ["start_year", "KQ start year"], ["end_year", "KQ end year"],
  ] as const;
  return <form action={action} className="card">
    <h2>Check your former-KQ details</h2>
    <p id="verification-help">All fields are required. Use your fictional fixture&apos;s details. Staff numbers use the format SYN-ALUM-001. Case and extra spaces are accepted; department, surname and service years must otherwise match.</p>
    <div className="grid">{fields.map(([name, label]) => {
      const year = name.endsWith("year");
      return <div className="field" key={name}>
        <label htmlFor={name}>{label}</label>
        <input id={name} name={name} type={year ? "number" : "text"} required
          aria-describedby="verification-help" autoComplete="off"
          min={year ? 1977 : undefined} max={year ? new Date().getFullYear() : undefined}
          maxLength={name === "staff_number" ? 40 : 150}
          value={values[name]} onChange={event => setValues({ ...values, [name]: event.target.value })} />
      </div>;
    })}</div>
    <p role="status" aria-live="polite">{state.message}</p>
    <button disabled={pending}>{pending ? "Checking details…" : "Verify alumni details"}</button>
  </form>;
}

export function AssistanceForm({ open }: { open: boolean }) {
  const [state, action, pending] = useActionState(submitAssistance, { message: "" });
  return <form action={action} className="card">
    <h2>Need a hand?</h2>
    <p>Missing a fixture or unable to resolve your verification? Request administrator assistance. No failed attempt suspends or rejects your account.</p>
    <p role="status" aria-live="polite">{state.message}</p>
    <button className="secondary" disabled={pending || open}>{open ? "Assistance request open" : pending ? "Requesting…" : "Request assistance"}</button>
    {open && <p>You can continue correcting your details and retrying while your request is open.</p>}
  </form>;
}
