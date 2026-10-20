import Link from "next/link";
import type { ReactNode } from "react";
import type { AlumniSummary, WorkExperience } from "@/lib/alumni-directory";
import { AlumniAvatar } from "./alumni-avatar";
import { Icon } from "./icon";

type FullProfile = AlumniSummary & { experience: WorkExperience[] };

const monthYear = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const formatMonth = (value: string | null) => value ? monthYear.format(new Date(`${value.slice(0, 10)}T00:00:00Z`)) : null;

function duration(start: string | null, end: string | null) {
  if (!start) return null;
  const from = new Date(`${start.slice(0, 10)}T00:00:00Z`);
  const to = end ? new Date(`${end.slice(0, 10)}T00:00:00Z`) : new Date();
  const months = Math.max(1, (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1);
  const years = Math.floor(months / 12), rest = months % 12;
  return [years && `${years} yr${years > 1 ? "s" : ""}`, rest && `${rest} mo${rest > 1 ? "s" : ""}`].filter(Boolean).join(" ");
}

function EditLink({ href, label }: { href: string; label: string }) {
  return <Link className="icon-link" href={href} aria-label={label} title={label}><Icon name="edit" width={18} height={18} /></Link>;
}

/**
 * LinkedIn-style profile used for your own profile (with edit links) and for
 * other members (with connect, message and mentorship actions).
 */
export function ProfileView({ profile, own = false, actions, connections, sidebar, notice }: {
  profile: FullProfile; own?: boolean; actions?: ReactNode; connections?: number; sidebar?: ReactNode; notice?: ReactNode;
}) {
  const topics = (profile.mentorship_topics || "").split("|").map(topic => topic.trim()).filter(Boolean);
  const current = [profile.current_job_title, profile.current_organization].filter(Boolean).join(" · ");
  return <div className="li-layout">
    <div className="li-main">
      {notice}
      <section className={`card li-hero banner-${profile.banner_theme || "horizon"}`} aria-label="Profile summary">
        <div className="li-banner" aria-hidden="true"><span className="li-banner-orbit" /></div>
        <div className="li-hero-body">
          <div className="li-avatar-wrap"><AlumniAvatar name={profile.full_name} image={profile.image} large />
            {own && <Link className="li-photo-edit" href="/profile/edit/photo" aria-label="Change profile photo"><Icon name="camera" width={16} height={16} /></Link>}</div>
          {own && <div className="li-hero-edit"><EditLink href="/profile/edit" label="Edit intro" /></div>}
          <h1>{profile.full_name}</h1>
          <p className="li-headline">{profile.headline || (own ? "Add a headline so people know what you do." : "Lumina member")}</p>
          <p className="li-meta">{[current, profile.location].filter(Boolean).join(" · ")}</p>
          <p className="li-meta">Former {profile.former_kq_role || "colleague"}{profile.former_kq_department ? `, ${profile.former_kq_department}` : ""} · Kenya Airways</p>
          {connections !== undefined && <p className="li-connections"><Link href={own ? "/network/connections" : "#"}>{connections} {connections === 1 ? "connection" : "connections"}</Link></p>}
          <div className="li-badges">
            {profile.mentorship_available && <span className="li-open"><strong>Open to mentoring</strong>{topics.length ? <span>{topics.slice(0, 3).join(" · ")}</span> : null}</span>}
            {profile.open_to_opportunities && <span className="li-open"><strong>Open to opportunities</strong><span>New roles and projects</span></span>}
          </div>
          {actions && <div className="li-actions">{actions}</div>}
        </div>
      </section>

      <section className="card li-section">
        <div className="li-section-head"><h2>About</h2>{own && <EditLink href="/profile/edit#about" label="Edit about" />}</div>
        {profile.biography ? <p className="profile-biography">{profile.biography}</p> : <p className="muted">{own ? "Tell people about your journey, what you work on now and what you'd like to help with." : "No summary added yet."}</p>}
      </section>

      <section className="card li-section">
        <div className="li-section-head"><h2>Experience</h2>{own && <Link className="icon-link" href="/profile/edit/experience" aria-label="Edit experience" title="Edit experience"><Icon name="plus" width={18} height={18} /></Link>}</div>
        {profile.experience.length ? <ol className="li-timeline">{profile.experience.map((work, index) => <li key={index}>
          <span className="li-org-mark" aria-hidden="true">{work.organization.trim()[0]}</span>
          <div><h3>{work.job_title}</h3><p>{work.organization}</p>
            <p className="small muted">{formatMonth(work.start_date) || "Start date not added"} – {work.is_current ? "Present" : formatMonth(work.end_date) || "End date not added"}{duration(work.start_date, work.is_current ? null : work.end_date) ? ` · ${duration(work.start_date, work.is_current ? null : work.end_date)}` : ""}</p>
            {work.description && <p className="li-description">{work.description}</p>}</div>
        </li>)}</ol> : <p className="muted">{own ? "Add the roles that shaped your career." : "No experience added yet."}</p>}
      </section>

      <section className="card li-section">
        <div className="li-section-head"><h2>Kenya Airways chapter</h2>{own && <EditLink href="/profile/edit#kq" label="Edit Kenya Airways chapter" />}</div>
        <div className="li-kq"><span className="li-org-mark kq" aria-hidden="true">KQ</span><div><h3>{profile.former_kq_role || "Role not added"}</h3><p>{profile.former_kq_department || "Department not added"}</p><p className="small muted">{profile.kq_start_year ?? "?"} – {profile.kq_end_year ?? "?"}</p></div></div>
      </section>

      <section className="card li-section">
        <div className="li-section-head"><h2>Skills</h2>{own && <Link className="icon-link" href="/profile/edit/skills" aria-label="Edit skills" title="Edit skills"><Icon name="plus" width={18} height={18} /></Link>}</div>
        {profile.skills.length ? <ul className="li-skills">{profile.skills.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p className="muted">{own ? "Add skills so mentees and colleagues can find you." : "No skills added yet."}</p>}
      </section>

      <section className="card li-section">
        <div className="li-section-head"><h2>Mentorship</h2>{own && <EditLink href="/profile/edit/mentorship" label="Edit mentorship settings" />}</div>
        {profile.mentorship_available ? <>
          <p>Available to mentor alumni on:</p>
          {topics.length ? <ul className="li-skills">{topics.map(topic => <li key={topic}>{topic}</li>)}</ul> : <p className="muted">Topics not listed yet.</p>}
        </> : <p className="muted">{own ? "You're not currently offering mentorship. Turn it on to appear in mentor search." : "Not currently taking mentorship requests."}</p>}
      </section>
    </div>
    {sidebar && <aside className="li-sidebar">{sidebar}</aside>}
  </div>;
}

export function PeopleList({ title, people }: { title: string; people: Pick<AlumniSummary, "id" | "full_name" | "headline" | "image">[] }) {
  if (!people.length) return null;
  return <section className="card li-people"><h2>{title}</h2><ul>{people.map(person => <li key={person.id}>
    <AlumniAvatar name={person.full_name} image={person.image} />
    <div><Link href={`/alumni/${person.id}`}>{person.full_name}</Link><p className="small muted">{person.headline || "Lumina member"}</p></div>
  </li>)}</ul></section>;
}
