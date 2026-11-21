import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { listExperience, ownProfileId } from "@/lib/profile-editor";
import { ExperienceForm } from "@/components/profile-editors";
import { Icon } from "@/components/icon";
import { EditNav } from "@/components/profile-edit-nav";
import { deleteExperienceAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ExperiencePage({ searchParams }: { searchParams: Promise<{ entry?: string; saved?: string }> }) {
  const session = await requireSession();
  const profileId = await ownProfileId(session.user.id);
  if (!profileId) redirect("/profile/edit");
  const [entries, { entry, saved }] = await Promise.all([listExperience(profileId), searchParams]);
  const editing = entries.find(item => item.id === entry);
  return <>
    <Link className="text-link back-link" href="/profile"><Icon name="arrow" className="flip" />Back to your profile</Link>
    <p className="eyebrow">Your professional story</p><h1>Experience</h1>
    <EditNav current="/profile/edit/experience" />
    {saved && <p className="card notice" role="status">Experience saved.</p>}
    <ExperienceForm key={editing?.id || "new"} entry={editing} />
    <section className="card li-section"><h2>Your roles</h2>
      {entries.length ? <ol className="li-timeline editable">{entries.map(item => <li key={item.id}>
        <span className="li-org-mark" aria-hidden="true">{item.organization.trim()[0]}</span>
        <div><h3>{item.job_title}</h3><p>{item.organization}</p><p className="small muted">{item.start_date?.slice(0, 7) || "?"} – {item.is_current ? "Present" : item.end_date?.slice(0, 7) || "?"}</p></div>
        <div className="actions"><Link className="button secondary" href={`/profile/edit/experience?entry=${item.id}`}>Edit</Link>
          <form action={deleteExperienceAction}><input type="hidden" name="entry_id" value={item.id} /><button className="secondary" aria-label={`Delete ${item.job_title} at ${item.organization}`}>Delete</button></form></div>
      </li>)}</ol> : <p className="muted">No roles yet. Add your first one above.</p>}
    </section>
  </>;
}
