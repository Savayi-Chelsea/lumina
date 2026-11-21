"use client";
import Link from "next/link";
import { useActionState } from "react";
import { bookSession, publishSlot } from "@/app/(alumni)/mentorship/session-actions";

const MODES = { video: "Video call", phone: "Phone call", in_person: "In person" };

export function SlotForm({ minDate, maxDate }: { minDate: string; maxDate: string }) {
  const [state, action, pending] = useActionState(publishSlot, { message: "" });
  return <form action={action} className="card admin-form slot-form">
    <div className="grid">
      <div className="field"><label htmlFor="slot-date">Date</label><input id="slot-date" name="date" type="date" min={minDate} max={maxDate} required /></div>
      <div className="field"><label htmlFor="slot-time">Start time (Nairobi)</label><input id="slot-time" name="time" type="time" step={900} required /></div>
      <div className="field"><label htmlFor="slot-duration">Length</label><select id="slot-duration" name="duration" defaultValue="45">
        {[30, 45, 60, 90].map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}</select></div>
      <div className="field"><label htmlFor="slot-mode">How you&apos;ll meet</label><select id="slot-mode" name="mode" defaultValue="video">
        {Object.entries(MODES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    </div>
    <div className="field"><label htmlFor="slot-details">Meeting link or place (optional)</label>
      <input id="slot-details" name="details" maxLength={300} placeholder="Shared only with the mentee who books this slot" /></div>
    <p role="status" aria-live="polite" className={state.ok ? "notice" : undefined}>{state.message}</p>
    <div className="actions"><button disabled={pending}>{pending ? "Publishing…" : "Publish slot"}</button></div>
  </form>;
}

export type BookableSlot = { id: string; label: string; mode: string };

export function BookForm({ mentorshipId, slots }: { mentorshipId: string; slots: BookableSlot[] }) {
  const [state, action, pending] = useActionState(bookSession, { message: "" });
  return <form action={action} className="card admin-form">
    <input type="hidden" name="mentorship_id" value={mentorshipId} />
    <fieldset className="slot-choices"><legend>Choose a time</legend>
      {slots.map(slot => <label key={slot.id} className="slot-choice"><input type="radio" name="slot_id" value={slot.id} required />
        <span><strong>{slot.label}</strong><span className="small muted">{MODES[slot.mode as keyof typeof MODES] || slot.mode}</span></span></label>)}
    </fieldset>
    <div className="field"><label htmlFor="agenda">What would you like to cover? (optional)</label>
      <textarea id="agenda" name="agenda" maxLength={500} rows={3} placeholder="For example: review my CV and plan my first certification" /></div>
    <p role="alert" className="auth-feedback" hidden={!state.message}>{state.message}</p>
    <div className="actions"><button disabled={pending}>{pending ? "Booking…" : "Book session"}</button><Link className="button secondary" href="/mentorship/sessions">Cancel</Link></div>
  </form>;
}
