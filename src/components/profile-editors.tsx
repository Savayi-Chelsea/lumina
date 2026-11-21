"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { addSkillAction, saveExperienceAction, saveMentorshipAction, uploadPhotoAction, type EditState } from "@/app/(alumni)/profile/edit/actions";
import type { ExperienceEntry, MentorshipSettings } from "@/lib/profile-editor";
import { searchSkills } from "@/lib/skill-catalog";
import { Icon } from "./icon";

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

/** Bolds the part of a skill name that matches what the member typed. */
function Highlight({ name, query }: { name: string; query: string }) {
  const at = query ? name.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{name}</>;
  return <>{name.slice(0, at)}<mark>{name.slice(at, at + query.length)}</mark>{name.slice(at + query.length)}</>;
}

/**
 * Searchable skills dropdown (ARIA combobox): the whole catalog A–Z when empty,
 * filtered as the member types, with skills already on the profile left out.
 * Choosing an option adds it straight away; anything typed can still be added.
 */
export function SkillForm({ options, taken, full = false }: { options: string[]; taken: string[]; full?: boolean }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(async (previous: EditState, data: FormData) => {
    const result = await addSkillAction(previous, data);
    if (result.ok) setQuery("");
    return result;
  }, { message: "" });
  const takenNames = useMemo(() => new Set(taken.map(name => name.toLowerCase())), [taken]);
  const trimmed = query.trim().replace(/\s+/g, " ");
  const matches = useMemo(() => searchSkills(options, trimmed).filter(name => !takenNames.has(name.toLowerCase())), [options, trimmed, takenNames]);
  const listed = trimmed.length >= 2 && (options.some(name => name.toLowerCase() === trimmed.toLowerCase()) || takenNames.has(trimmed.toLowerCase()));
  const custom = trimmed.length >= 2 && !listed ? trimmed : null;
  const items = custom ? [...matches, custom] : matches;

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`skill-option-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function choose(name: string) {
    flushSync(() => { setQuery(name); setOpen(false); setActive(-1); });
    form.current?.requestSubmit();
  }
  function type(value: string) {
    setQuery(value); setOpen(true);
    const next = value.trim().toLowerCase();
    const first = searchSkills(options, next).find(name => !takenNames.has(name.toLowerCase()));
    setActive(next && first?.toLowerCase().startsWith(next) ? 0 : -1);
  }
  function key(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, items.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
    else if (event.key === "Enter" && open && active >= 0 && items[active]) { event.preventDefault(); choose(items[active]); }
    else if (event.key === "Escape") { if (open) { event.preventDefault(); setOpen(false); setActive(-1); } else setQuery(""); }
  }

  return <form ref={form} action={action} className="skill-form">
    <div className="field skill-picker">
      <label htmlFor="skill" id="skill-label">Add a skill</label>
      <div className="combobox">
        <input ref={input} id="skill" name="skill" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls="skill-options"
          aria-activedescendant={open && active >= 0 ? `skill-option-${active}` : undefined} aria-describedby="skill-hint" autoComplete="off"
          required minLength={2} maxLength={100} value={query} disabled={full} readOnly={pending} placeholder="Search or browse skills A to Z"
          onChange={event => type(event.target.value)} onKeyDown={key} onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }} />
        <button type="button" className="combobox-toggle" tabIndex={-1} disabled={full} aria-label={open ? "Hide the skills list" : "Show all skills"}
          onMouseDown={event => event.preventDefault()} onClick={() => { setOpen(value => !value); input.current?.focus(); }}><Icon name="chevron" width={18} height={18} /></button>
        {open && <ul id="skill-options" role="listbox" aria-labelledby="skill-label" className="combobox-list">
          {items.length ? items.map((name, index) => <li key={name} id={`skill-option-${index}`} role="option" aria-selected={index === active}
              className={`${index === active ? "combobox-active" : ""}${name === custom ? " combobox-custom" : ""}`.trim() || undefined}
              onMouseDown={event => event.preventDefault()} onMouseMove={() => active !== index && setActive(index)} onClick={() => choose(name)}>
              {name === custom ? <><Icon name="plus" width={14} height={14} /><span>Add “{name}”</span></> : <span><Highlight name={name} query={trimmed} /></span>}
            </li>)
            : <li className="combobox-empty" role="option" aria-selected={false} aria-disabled="true">No more skills to add</li>}
        </ul>}
      </div>
      <p id="skill-hint" className="field-hint" aria-live="polite">{full ? "You've reached the 30-skill limit. Remove one to add another."
        : trimmed ? `${matches.length} ${matches.length === 1 ? "skill matches" : "skills match"} “${trimmed}”. Choose one, or add your own.`
        : `${matches.length} skills across all fields, A to Z. Type to search, or add your own.`}</p>
    </div>
    <button disabled={pending || full}>{pending ? "Adding…" : "Add skill"}</button>
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
