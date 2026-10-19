"use client";

import Link from "next/link";
import { startTransition, useActionState, type FormEvent } from "react";
import { manageEvent, manageOpportunity, type ManageState } from "@/app/admin/community-actions";
import { EVENT_CATEGORIES, EVENT_FORMATS, OPPORTUNITY_TYPES, WORK_MODES } from "@/lib/community-input";

type Values = Record<string, string | number | null | undefined>;
type FieldProps = { name: string; label: string; values: Values; max?: number; required?: boolean; hint?: string };

const value = (values: Values, name: string) => String(values[name] ?? "");

/**
 * Submits through the action without React's automatic form reset, so an admin's
 * edits survive a validation error exactly as typed. The clicked button supplies the intent.
 */
function submitWith(action: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(data));
  };
}

function Text({ name, label, values, max, required = true, hint, type = "text" }: FieldProps & { type?: string }) {
  return <div className="field"><label htmlFor={name}>{label}{required ? "" : " (optional)"}</label>
    <input id={name} name={name} type={type} maxLength={max} required={required} defaultValue={value(values, name)} aria-describedby={hint ? `${name}-hint` : undefined} />
    {hint && <p id={`${name}-hint`} className="field-hint">{hint}</p>}</div>;
}
function Area({ name, label, values, max }: FieldProps) {
  return <div className="field field-wide"><label htmlFor={name}>{label}</label><textarea id={name} name={name} maxLength={max} required defaultValue={value(values, name)} /></div>;
}
function Select({ name, label, values, options }: FieldProps & { options: readonly (readonly [string, string])[] }) {
  return <div className="field"><label htmlFor={name}>{label}</label><select id={name} name={name} required defaultValue={value(values, name)}>
    <option value="" disabled>Choose…</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div>;
}
function Actions({ pending, back, published }: { pending: boolean; back: string; published: boolean }) {
  return <div className="actions">
    <button name="intent" value="published" disabled={pending}>{pending ? "Saving…" : published ? "Save and keep published" : "Publish"}</button>
    <button className="secondary" name="intent" value="draft" disabled={pending}>{published ? "Save as draft (unpublish)" : "Save draft"}</button>
    <Link className="button secondary" href={back}>Cancel</Link>
  </div>;
}

export function EventForm({ initial = {}, published = false }: { initial?: Values; published?: boolean }) {
  const [state, action, pending] = useActionState<ManageState, FormData>(manageEvent, { message: "" });
  const values = initial;
  return <form onSubmit={submitWith(action)} className="card admin-form">
    {initial.id && <input type="hidden" name="id" value={String(initial.id)} />}
    <p className="auth-feedback" role="alert" hidden={!state.message}>{state.message}</p>
    <div className="grid">
      <Text name="title" label="Title" values={values} max={150} />
      <Select name="category" label="Category" values={values} options={EVENT_CATEGORIES.map(item => [item, item] as const)} />
      <Text name="summary" label="Short summary" values={values} max={300} hint="Shown on event cards. Up to 300 characters." />
      <Select name="format" label="Format" values={values} options={Object.entries(EVENT_FORMATS)} />
      <Text name="starts_at" label="Starts (East Africa Time)" type="datetime-local" values={values} />
      <Text name="ends_at" label="Ends (East Africa Time)" type="datetime-local" values={values} />
      <Text name="location" label="Location or online platform" values={values} max={200} hint="For online events, name the platform; joining details can be shared with attendees." />
      <Text name="capacity" label="Capacity" type="number" values={values} required={false} hint="Leave blank for unlimited places." />
      <Area name="description" label="Description" values={values} max={5000} />
    </div>
    <Actions pending={pending} back="/admin/events" published={published} />
  </form>;
}

export function OpportunityForm({ initial = {}, published = false }: { initial?: Values; published?: boolean }) {
  const [state, action, pending] = useActionState<ManageState, FormData>(manageOpportunity, { message: "" });
  const values = initial;
  return <form onSubmit={submitWith(action)} className="card admin-form">
    {initial.id && <input type="hidden" name="id" value={String(initial.id)} />}
    <p className="auth-feedback" role="alert" hidden={!state.message}>{state.message}</p>
    <div className="grid">
      <Text name="title" label="Title" values={values} max={150} />
      <Text name="organization" label="Organization" values={values} max={200} />
      <Select name="opportunity_type" label="Type" values={values} options={OPPORTUNITY_TYPES.map(item => [item, item] as const)} />
      <Select name="work_mode" label="Work mode" values={values} options={Object.entries(WORK_MODES)} />
      <Text name="location" label="Location" values={values} max={150} />
      <Text name="industry" label="Industry" values={values} max={150} required={false} />
      <Text name="summary" label="Short summary" values={values} max={300} hint="Shown on listing cards. Up to 300 characters." />
      <Text name="closes_on" label="Closing date" type="date" values={values} required={false} hint="Leave blank if open until filled. Listings disappear after this date." />
      <Area name="description" label="Description" values={values} max={5000} />
      <Area name="how_to_apply" label="How to apply" values={values} max={1000} />
    </div>
    <Actions pending={pending} back="/admin/opportunities" published={published} />
  </form>;
}
