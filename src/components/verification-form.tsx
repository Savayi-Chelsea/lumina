"use client";

import { useActionState, useState } from "react";
import { submitAssistance, submitVerification } from "@/app/(alumni)/verify/actions";

export function VerificationForm({ departments = [] }: { departments?: string[] }) {
  const [state, action, pending] = useActionState(submitVerification, { message: "" });
  const [values, setValues] = useState({ staff_number: "", surname: "", department: "", start_year: "", end_year: "" });
  const fields = [
    ["staff_number", "Staff number"], ["surname", "Surname"],
    ["department", "Former KQ department"], ["start_year", "KQ start year"], ["end_year", "KQ end year"],
  ] as const;
  return <form action={action} className="card">
    <h2>Check your former-KQ details</h2>
    <p id="verification-help">All fields are required. Enter your details as they appear in your service records. Staff numbers look like SYN-ALUM-001. Case and extra spaces are accepted; surname and service years must otherwise match.</p>
    <div className="grid">{fields.map(([name, label]) => {
      const year = name.endsWith("year");
      if (name === "department" && departments.length) return <div className="field" key={name}>
        <label htmlFor={name}>{label}</label>
        <select id={name} name={name} required aria-describedby="verification-help" value={values.department} onChange={event => setValues({ ...values, department: event.target.value })}>
          <option value="" disabled>Choose your department</option>
          {departments.map(department => <option key={department} value={department}>{department}</option>)}
        </select>
      </div>;
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
    <p>Can&apos;t find your record, or your details don&apos;t match? Request administrator assistance. No failed attempt suspends or rejects your account.</p>
    <p role="status" aria-live="polite">{state.message}</p>
    <button className="secondary" disabled={pending || open}>{open ? "Assistance request open" : pending ? "Requesting…" : "Request assistance"}</button>
    {open && <p>You can continue correcting your details and retrying while your request is open.</p>}
  </form>;
}
