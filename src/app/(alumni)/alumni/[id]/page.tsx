import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors, profileIdPattern } from "@/lib/mentorship-contract";
import { discoverableMentors } from "@/lib/mentor-profiles";
import { Icon } from "@/components/icon";

export default async function AlumniProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <section className="card mentorship-gate"><h1>Complete verification to view mentor profiles.</h1><p>Mentor profiles are available to active, verified alumni and active administrators.</p><Link href="/verify" className="button">Verify alumni details</Link></section>;
  const { id } = await params;
  if (!profileIdPattern.test(id)) notFound();
  const profile = (await discoverableMentors([id]))[0];
  if (!profile) notFound();
  return <div className="mentor-profile"><Link className="text-link" href="/mentorship">Back to mentorship<Icon name="arrow" /></Link><section className="mentor-profile-hero"><div className="mentor-profile-avatar" aria-hidden="true">{profile.full_name.split(/\s+/).slice(0,2).map(part => part[0]).join("")}</div><div>{profile.synthetic && <span className="demo-label">Synthetic demo profile</span>}<p className="eyebrow">{profile.former_kq_department || "Alumni experience"}</p><h1>{profile.full_name}</h1><p>{profile.headline || "Professional profile"}</p><span className="availability"><Icon name="check" width={14} height={14} />Available for mentorship</span></div></section>
    <div className="mentor-profile-grid"><section className="card"><h2>A little about my journey</h2><p className="profile-biography">{profile.biography || "This alumnus has not added a biography yet."}</p><h3>Mentorship interests</h3><p>{profile.mentorship_topics || "Mentorship topics have not been added yet."}</p><h3>Skills and experience</h3>{profile.skills.length ? <ul className="profile-skills">{profile.skills.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p className="muted">No skills listed yet.</p>}</section>
      <section className="card"><h2>Professional story</h2><dl className="mentor-career"><dt>Former KQ role</dt><dd>{profile.former_kq_role || "Not provided"}</dd><dt>Former KQ department</dt><dd>{profile.former_kq_department || "Not provided"}</dd><dt>KQ service years</dt><dd>{profile.kq_start_year ?? "Not provided"} – {profile.kq_end_year ?? "Not provided"}</dd><dt>Current position</dt><dd>{profile.current_job_title || "Not provided"}</dd><dt>Current organization</dt><dd>{profile.current_organization || "Not provided"}</dd><dt>Industry</dt><dd>{profile.industry || "Not provided"}</dd><dt>Location</dt><dd>{profile.location || "Not provided"}</dd></dl><p className="small muted">This profile is discoverable because this mentor has opted into matching and is available. Mentor requests and messaging are not available yet.</p></section></div>
    {profile.synthetic && <p className="preview-notice">This is a fictional profile from Lumina’s synthetic alumni dataset, used to demonstrate real mentor search. It is not a real Kenya Airways employee record.</p>}
  </div>;
}
