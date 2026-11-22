"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { importCvAction, type CvImportState } from "@/app/(alumni)/profile/edit/actions";
import { parseCv, type CvSuggestions } from "@/lib/cv-parser";
import { CvReadError, readCvFile } from "@/lib/cv-text";
import { Icon } from "./icon";

type FieldKey = "headline" | "current_job_title" | "current_organization" | "industry" | "location" | "biography";
type KqKey = "former_kq_role" | "former_kq_department";
export type CvCurrent = Partial<Record<FieldKey | KqKey, string | null>> & { kq_start_year: number | null; kq_end_year: number | null };
type Field = { key: FieldKey; label: string; value: string; include: boolean; current: string | null; long?: boolean };
type Role = { id: number; include: boolean; exists: boolean; job_title: string; organization: string; start: string; end: string; is_current: boolean; description: string };

const FIELD_LABELS: [FieldKey, string, keyof CvSuggestions][] = [
  ["headline", "Headline", "headline"], ["current_job_title", "Current title", "currentTitle"],
  ["current_organization", "Current organization", "currentOrganization"], ["industry", "Industry", "industry"],
  ["location", "Location", "location"], ["biography", "About", "summary"],
];
const month = (value: string | null) => value ? new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "";

/**
 * "Fill in from your CV": the file is read in this browser and never uploaded.
 * Members review every suggestion; only what they tick is sent and saved.
 */
export function CvImport({ current, existingRoles, existingSkills, skillLimit }: { current: CvCurrent; existingRoles: string[]; existingSkills: string[]; skillLimit: number }) {
  const [stage, setStage] = useState<"choose" | "reading" | "review">("choose");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [skills, setSkills] = useState<{ name: string; include: boolean }[]>([]);
  const [kq, setKq] = useState<{ include: boolean; role: string; department: string; start: string; end: string } | null>(null);
  const [state, action, pending] = useActionState<CvImportState, FormData>(importCvAction, { message: "" });
  const knownRoles = useMemo(() => new Set(existingRoles), [existingRoles]);
  const knownSkills = useMemo(() => new Set(existingSkills.map(name => name.toLowerCase())), [existingSkills]);
  const room = Math.max(0, skillLimit - existingSkills.length);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(""); setFileName(file.name); setStage("reading");
    try {
      const cv = parseCv(await readCvFile(file));
      setFields(FIELD_LABELS.map(([key, label, from]) => {
        const value = (cv[from] as string | null) || "";
        const existing = current[key] || null;
        return { key, label, value, current: existing, include: Boolean(value) && !existing, long: key === "biography" };
      }).filter(field => field.value && field.value.trim().toLowerCase() !== (field.current || "").trim().toLowerCase()));
      setRoles(cv.experience.map((entry, id) => {
        const exists = knownRoles.has(`${entry.title.toLowerCase()}|${entry.organization.toLowerCase()}|${entry.start}`);
        return { id, exists, include: !exists && Boolean(entry.title && entry.organization), job_title: entry.title, organization: entry.organization,
          start: entry.start || "", end: entry.end || "", is_current: entry.current, description: entry.description };
      }));
      let left = room;
      setSkills(cv.skills.filter(name => !knownSkills.has(name.toLowerCase())).map(name => ({ name, include: left-- > 0 })));
      setKq(cv.kq && !current.former_kq_role ? { include: true, role: cv.kq.role, department: current.former_kq_department || cv.kq.department || "",
        start: String(current.kq_start_year ?? cv.kq.startYear ?? ""), end: String(current.kq_end_year ?? cv.kq.endYear ?? "") } : null);
      setStage("review");
    } catch (problem) {
      setError(problem instanceof CvReadError ? problem.message : "That file could not be read. Try a PDF exported from Word, Google Docs or LinkedIn.");
      setStage("choose");
    }
  }

  const chosenSkills = skills.filter(skill => skill.include).length;
  const payload = JSON.stringify({
    fields: Object.fromEntries([
      ...fields.filter(field => field.include).map(field => [field.key, field.value]),
      ...(kq?.include ? [["former_kq_role", kq.role], ...(kq.department ? [["former_kq_department", kq.department]] : [])] : []),
    ]),
    kq_start_year: kq?.include && kq.start ? Number(kq.start) : null, kq_end_year: kq?.include && kq.end ? Number(kq.end) : null,
    experience: roles.filter(role => role.include).map(role => ({ job_title: role.job_title, organization: role.organization, start: role.start,
      end: role.is_current ? null : role.end, is_current: role.is_current, description: role.description })),
    skills: skills.filter(skill => skill.include).map(skill => skill.name),
  });
  const nothing = !fields.length && !roles.length && !skills.length && !kq;
  const updateRole = (id: number, change: Partial<Role>) => setRoles(list => list.map(role => role.id === id ? { ...role, ...change } : role));

  if (state.ok) return <section className="card cv-done" role="status">
    <Icon name="check" width={28} height={28} />
    <h2>Profile updated</h2>
    <p>{state.message}</p>
    <div className="actions"><Link className="button" href="/profile">View your profile</Link><Link className="button secondary" href="/profile/edit">Review the intro</Link></div>
  </section>;

  return <>
    <section className="card cv-choose">
      <h2>Your CV</h2>
      <p className="cv-privacy"><Icon name="check" width={14} height={14} />Your CV is read on this device. It is not uploaded or stored; only the details you choose below are saved.</p>
      <div className="field">
        <label htmlFor="cv-file">{stage === "review" ? "Choose a different file" : "Choose a PDF or Word (.docx) file, up to 5 MB"}</label>
        <input id="cv-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={stage === "reading" || pending} onChange={event => choose(event.target.files?.[0])} />
        <p className="field-hint">Tip: on LinkedIn, open your profile, select More, then Save to PDF.</p>
      </div>
      {stage === "reading" && <p className="muted" role="status">Reading {fileName}…</p>}
      {error && <p className="auth-feedback" role="alert">{error}</p>}
    </section>

    {stage === "review" && (nothing
      ? <section className="card" role="status"><h2>Nothing to suggest</h2><p>We couldn&apos;t find profile details in {fileName}. CVs with headings such as Experience and Skills, and a date range for each role, work best.</p></section>
      : <form action={action} className="cv-review">
        <input type="hidden" name="payload" value={payload} />
        <p className="results-count" role="status">Found in {fileName}. Tick what you want to add, and edit anything before saving.</p>
        {state.message && !state.ok && <p className="auth-feedback" role="alert">{state.message}</p>}

        {fields.length > 0 && <fieldset className="card cv-section"><legend>About you</legend>
          {fields.map(field => <div key={field.key} className="cv-item">
            <label className="confirmation"><input type="checkbox" checked={field.include} onChange={event => setFields(list => list.map(item => item.key === field.key ? { ...item, include: event.target.checked } : item))} /> {field.label}</label>
            {field.long ? <textarea aria-label={field.label} value={field.value} maxLength={5000} rows={4} disabled={!field.include} onChange={event => setFields(list => list.map(item => item.key === field.key ? { ...item, value: event.target.value } : item))} />
              : <input aria-label={field.label} value={field.value} maxLength={field.key === "headline" || field.key === "current_organization" ? 200 : 150} disabled={!field.include} onChange={event => setFields(list => list.map(item => item.key === field.key ? { ...item, value: event.target.value } : item))} />}
            {field.current && <p className="field-hint">Replaces: {field.current.length > 120 ? `${field.current.slice(0, 120)}…` : field.current}</p>}
          </div>)}
        </fieldset>}

        {kq && <fieldset className="card cv-section"><legend>Your Kenya Airways chapter</legend>
          <label className="confirmation"><input type="checkbox" checked={kq.include} onChange={event => setKq({ ...kq, include: event.target.checked })} /> Add my Kenya Airways chapter</label>
          <div className="grid">
            <div className="field"><label htmlFor="cv-kq-role">Former KQ role</label><input id="cv-kq-role" value={kq.role} maxLength={150} disabled={!kq.include} onChange={event => setKq({ ...kq, role: event.target.value })} /></div>
            <div className="field"><label htmlFor="cv-kq-dept">Former KQ department</label><input id="cv-kq-dept" value={kq.department} maxLength={150} disabled={!kq.include} onChange={event => setKq({ ...kq, department: event.target.value })} /></div>
            <div className="field"><label htmlFor="cv-kq-start">KQ start year</label><input id="cv-kq-start" inputMode="numeric" pattern="\d{4}" value={kq.start} disabled={!kq.include} onChange={event => setKq({ ...kq, start: event.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
            <div className="field"><label htmlFor="cv-kq-end">KQ end year</label><input id="cv-kq-end" inputMode="numeric" pattern="\d{4}" value={kq.end} disabled={!kq.include} onChange={event => setKq({ ...kq, end: event.target.value.replace(/\D/g, "").slice(0, 4) })} /></div>
          </div>
          {kq.department && <p className="field-hint">The department is a suggestion from your job title; check it.</p>}
        </fieldset>}

        {roles.length > 0 && <fieldset className="card cv-section"><legend>Experience ({roles.filter(role => role.include).length} of {roles.length} selected)</legend>
          {roles.map(role => <div key={role.id} className="cv-role">
            <label className="confirmation"><input type="checkbox" checked={role.include} onChange={event => updateRole(role.id, { include: event.target.checked })} />
              <span><strong>{role.job_title || "Untitled role"}</strong>{role.organization ? ` · ${role.organization}` : ""} <span className="muted">{month(role.start)} – {role.is_current ? "Present" : month(role.end)}</span>
              {role.exists && <span className="badge">Already on your profile</span>}</span></label>
            {role.include && <div className="grid">
              <div className="field"><label htmlFor={`cv-title-${role.id}`}>Title</label><input id={`cv-title-${role.id}`} required maxLength={150} value={role.job_title} onChange={event => updateRole(role.id, { job_title: event.target.value })} /></div>
              <div className="field"><label htmlFor={`cv-org-${role.id}`}>Organization</label><input id={`cv-org-${role.id}`} required maxLength={200} value={role.organization} onChange={event => updateRole(role.id, { organization: event.target.value })} /></div>
              <div className="field"><label htmlFor={`cv-start-${role.id}`}>Start</label><input id={`cv-start-${role.id}`} type="month" required value={role.start} onChange={event => updateRole(role.id, { start: event.target.value })} /></div>
              <div className="field"><label htmlFor={`cv-end-${role.id}`}>End</label><input id={`cv-end-${role.id}`} type="month" required={!role.is_current} disabled={role.is_current} value={role.is_current ? "" : role.end} onChange={event => updateRole(role.id, { end: event.target.value })} /></div>
              <label className="confirmation field-wide"><input type="checkbox" checked={role.is_current} onChange={event => updateRole(role.id, { is_current: event.target.checked })} /> I currently work here</label>
              <div className="field field-wide"><label htmlFor={`cv-desc-${role.id}`}>Description (optional)</label><textarea id={`cv-desc-${role.id}`} maxLength={2000} rows={3} value={role.description} onChange={event => updateRole(role.id, { description: event.target.value })} /></div>
            </div>}
          </div>)}
        </fieldset>}

        {skills.length > 0 && <fieldset className="card cv-section"><legend>Skills ({chosenSkills} selected)</legend>
          <p className="field-hint">You have room for {room} more {room === 1 ? "skill" : "skills"} (profiles list up to {skillLimit}).</p>
          <ul className="cv-skills">{skills.map(skill => <li key={skill.name}><label className={`chip${skill.include ? " chip-active" : ""}`}>
            <input type="checkbox" className="sr-only" checked={skill.include} onChange={event => setSkills(list => list.map(item => item.name === skill.name ? { ...item, include: event.target.checked } : item))} />
            {skill.include && <Icon name="check" width={12} height={12} />}{skill.name}</label></li>)}</ul>
          {chosenSkills > room && <p className="auth-feedback" role="alert">Only the first {room} selected skills will be added.</p>}
        </fieldset>}

        <div className="actions cv-actions"><button disabled={pending}>{pending ? "Saving…" : "Add to my profile"}</button><Link className="button secondary" href="/profile">Cancel</Link></div>
      </form>)}
  </>;
}
