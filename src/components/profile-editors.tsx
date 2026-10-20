"use client";

import { useActionState, useRef, useState } from "react";
import { addSkillAction, saveExperienceAction, saveMentorshipAction, uploadPhotoAction } from "@/app/(alumni)/profile/edit/actions";
import type { ExperienceEntry, MentorshipSettings } from "@/lib/profile-editor";

function Status({ state }: { state: { message: string; ok?: boolean } }) {
  return <p className={state.ok ? "auth-notice" : "auth-feedback"} role={state.ok ? "status" : "alert"} hidden={!state.message}>{state.message}</p>;
}

export function ExperienceForm({ entry }: { entry?: ExperienceEntry }) {
  const [state, action, pending] = useActionState(saveExperienceAction, { message: "" });
  const [current, setCurrent] = useState(entry?.is_current ?? false);
  return <form action={action} className="card admin-form">
    <h2>{entry ? "Edit experience" : "Add experience"}</h2>
    {entry && <input type="hidden" name="entry_id" value={entry.id} />}
    <Status state={state} />
    <div className="grid">
      <div className="field"><label htmlFor="job_title">Title</label><input id="job_title" name="job_title" required maxLength={150} defaultValue={entry?.job_title} /></div>
      <div className="field"><label htmlFor="organization">Organization</label><input id="organization" name="organization" required maxLength={200} defaultValue={entry?.organization} /></div>
      <div className="field"><label htmlFor="start_month">Start</label><input id="start_month" name="start_month" type="month" required defaultValue={entry?.start_date?.slice(0, 7)} /></div>
      <div className="field"><label htmlFor="end_month">End</label><input id="end_month" name="end_month" type="month" disabled={current} required={!current} defaultValue={entry?.end_date?.slice(0, 7)} /></div>
      <label className="confirmation field-wide"><input type="checkbox" name="is_current" checked={current} onChange={event => setCurrent(event.target.checked)} /> I currently work here</label>
      <div className="field field-wide"><label htmlFor="description">Description (optional)</label><textarea id="description" name="description" maxLength={2000} defaultValue={entry?.description || ""} /></div>
    </div>
    <div className="actions"><button disabled={pending}>{pending ? "Saving…" : "Save"}</button></div>
  </form>;
}

export function SkillForm() {
  const [state, action, pending] = useActionState(addSkillAction, { message: "" });
  return <form action={action} className="skill-form">
    <div className="field"><label htmlFor="skill">Add a skill</label><input id="skill" name="skill" required minLength={2} maxLength={100} placeholder="For example: Cloud architecture" /></div>
    <button disabled={pending}>{pending ? "Adding…" : "Add skill"}</button>
    <Status state={state} />
  </form>;
}

export function MentorshipSettingsForm({ settings }: { settings: MentorshipSettings }) {
  const [state, action, pending] = useActionState(saveMentorshipAction, { message: "" });
  const [consent, setConsent] = useState(settings.consent_to_matching);
  return <form action={action} className="card admin-form">
    <Status state={state} />
    <label className="confirmation"><input type="checkbox" name="consent_to_matching" checked={consent} onChange={event => setConsent(event.target.checked)} /> Include my profile in mentor matching</label>
    <p className="field-hint">Your headline, biography, skills, experience and topics are used to match you with members looking for guidance. Turning this off removes you from mentor search.</p>
    <label className="confirmation"><input type="checkbox" name="available_for_mentorship" defaultChecked={settings.available_for_mentorship} disabled={!consent} /> I&apos;m available to take on mentees now</label>
    <div className="field"><label htmlFor="mentorship_topics">Topics I can help with</label><textarea id="mentorship_topics" name="mentorship_topics" maxLength={500} defaultValue={(settings.mentorship_topics || "").split("|").join("\n")} placeholder={"One per line, for example:\nMoving into cloud engineering\nAviation leadership"} /><p className="field-hint">Up to 10 topics, one per line.</p></div>
    <div className="actions"><button disabled={pending}>{pending ? "Saving…" : "Save mentorship settings"}</button></div>
  </form>;
}

/** Resizes in the browser to a 400 × 400 JPEG so uploads stay small; the server re-validates. */
export function PhotoForm() {
  const [state, action, pending] = useActionState(uploadPhotoAction, { message: "" });
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function choose(file: File | undefined) {
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Choose a JPEG, PNG or WebP image."); return; }
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) { setError("That image could not be read."); return; }
    const size = 400, side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || !input.current) { setError("That image could not be processed."); return; }
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    input.current.files = transfer.files;
    setPreview(URL.createObjectURL(blob));
  }
  return <form action={action} className="card admin-form">
    <Status state={state} />
    {error && <p className="auth-feedback" role="alert">{error}</p>}
    <div className="field"><label htmlFor="photo-picker">Choose a photo</label>
      <input id="photo-picker" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => choose(event.target.files?.[0])} />
      <input ref={input} type="file" name="photo" hidden /></div>
    {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
    {preview && <img className="photo-preview" src={preview} alt="Preview of your new profile photo" width={160} height={160} />}
    <div className="actions"><button disabled={pending || !preview}>{pending ? "Uploading…" : "Save photo"}</button></div>
  </form>;
}
