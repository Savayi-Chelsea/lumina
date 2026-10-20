"use client";
import Link from "next/link";
import { useActionState } from "react";
import { updateProfile } from "@/app/(alumni)/profile/actions";
import type { Profile } from "@/lib/profiles";

const BANNERS = { horizon: "Horizon", savanna: "Savanna", coast: "Coast", night: "Night flight", dawn: "Dawn" } as const;
const groups = [
  { id: "intro", title: "Intro", fields: [["full_name", "Full name", 150], ["headline", "Headline", 200]] },
  { id: "today", title: "Where you are today", fields: [["current_job_title", "Current job title", 150], ["current_organization", "Current organization", 200], ["industry", "Industry", 150], ["location", "Location", 150]] },
  { id: "about", title: "About", fields: [["biography", "Biography", 5000]] },
  { id: "kq", title: "Your Kenya Airways chapter", fields: [["former_kq_role", "Former KQ role", 150], ["former_kq_department", "Former KQ department", 150], ["kq_start_year", "KQ start year", 4], ["kq_end_year", "KQ end year", 4]] },
] as const;

export function ProfileForm({ profile, name }: { profile: Profile | null; name?: string | null }) {
  const [state, action, pending] = useActionState(updateProfile, { message: "", ok: false });
  return <form action={action} className="card profile-edit-form">
    <p className="muted">Full name is required. Add your former KQ role, department and service years to complete your profile. Service years must be between 1977 and the current year.</p>
    {groups.map(group => <fieldset key={group.id} id={group.id}><legend>{group.title}</legend><div className="grid">{group.fields.map(([field, label, max]) => {
      const value = profile?.[field as keyof Profile] ?? (field === "full_name" ? name : "") ?? "";
      return <div className={`field${field === "biography" ? " field-wide" : ""}`} key={field}>
        <label htmlFor={field}>{label}{field === "full_name" ? " (required)" : ""}</label>
        {field === "biography" ? <textarea id={field} name={field} maxLength={max} defaultValue={String(value)} placeholder="Your journey, what you work on now and what you'd like to help with." />
          : <input id={field} name={field} type={field.includes("year") ? "number" : "text"} min={field.includes("year") ? 1977 : undefined} max={field.includes("year") ? new Date().getFullYear() : undefined} maxLength={max} required={field === "full_name"} defaultValue={String(value)} />}
      </div>;
    })}</div></fieldset>)}
    <fieldset id="presentation"><legend>Presentation</legend><div className="grid">
      <div className="field"><label htmlFor="banner_theme">Profile banner</label><select id="banner_theme" name="banner_theme" defaultValue={profile?.banner_theme || "horizon"}>{Object.entries(BANNERS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <label className="confirmation"><input type="checkbox" name="open_to_opportunities" defaultChecked={profile?.open_to_opportunities} /> Show that I&apos;m open to opportunities</label>
    </div></fieldset>
    <p role="status" aria-live="polite">{state.message}{state.ok && <> <Link className="text-link" href="/profile">View your profile</Link></>}</p>
    <div className="actions"><button disabled={pending}>{pending ? "Saving…" : "Save profile"}</button><Link className="button secondary" href="/profile">Cancel</Link></div>
  </form>;
}
