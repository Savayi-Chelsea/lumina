import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listSkills, ownProfileId, SKILL_LIMIT } from "@/lib/profile-editor";
import { SkillForm } from "@/components/profile-editors";
import { Icon } from "@/components/icon";
import { EditNav } from "@/components/profile-edit-nav";
import { removeSkillAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const session = await requireSession();
  const profileId = await ownProfileId(session.user.id);
  if (!profileId) redirect("/profile/edit");
  const skills = await listSkills(profileId);
  return <>
    <Link className="text-link back-link" href="/profile"><Icon name="arrow" className="flip" />Back to your profile</Link>
    <p className="eyebrow">Your professional story</p><h1>Skills</h1>
    <EditNav current="/profile/edit/skills" />
    <section className="card li-section">
      <SkillForm />
      <h2>Your skills ({skills.length} of {SKILL_LIMIT})</h2>
      {skills.length ? <ul className="li-skills removable">{skills.map(skill => <li key={skill.id}>{skill.name}
        <form action={removeSkillAction}><input type="hidden" name="skill_id" value={skill.id} /><button className="chip-remove" aria-label={`Remove ${skill.name}`}>×</button></form></li>)}</ul>
        : <p className="muted">No skills yet.</p>}
    </section>
  </>;
}
