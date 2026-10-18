import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors, profileIdPattern } from "@/lib/mentorship-contract";
import { alumniProfile } from "@/lib/alumni-directory";
import { networkReturn, type SearchParameters } from "@/lib/network-query";
import { AlumniAvatar } from "@/components/alumni-avatar";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";

export default async function AlumniProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParameters> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate />;
  const { id } = await params;
  if (!profileIdPattern.test(id)) notFound();
  const profile = await alumniProfile(id);
  if (!profile) notFound();
  const from = (await searchParams)?.from;
  const back = from === "mentorship" ? "/mentorship" : networkReturn(from);
  return <div className="mentor-profile"><Link className="text-link" href={back}>{from === "mentorship" ? "Back to mentorship" : "Back to Network"}<Icon name="arrow" /></Link><section className="mentor-profile-hero"><AlumniAvatar name={profile.full_name} image={profile.image} large /><div>{profile.synthetic && <span className="demo-label">Synthetic demo profile</span>}<p className="eyebrow">{profile.former_kq_department || "Alumni experience"}</p><h1>{profile.full_name}</h1><p>{profile.headline || "Professional profile"}</p>{profile.mentorship_available && <span className="availability"><Icon name="check" width={14} height={14} />Available for mentorship</span>}</div></section>
    <div className="mentor-profile-grid"><section className="card"><h2>A little about my journey</h2><p className="profile-biography">{profile.biography || "This alumnus has not added a biography yet."}</p>{profile.mentorship_available && <><h3>Mentorship interests</h3><p>{profile.mentorship_topics || "Mentorship topics have not been added yet."}</p></>}<h3>Skills and experience</h3>{profile.skills.length ? <ul className="profile-skills">{profile.skills.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p className="muted">No skills listed yet.</p>}</section>
      <section className="card"><h2>Professional story</h2><dl className="mentor-career"><dt>Former KQ role</dt><dd>{profile.former_kq_role || "Not provided"}</dd><dt>Former KQ department</dt><dd>{profile.former_kq_department || "Not provided"}</dd><dt>KQ service years</dt><dd>{profile.kq_start_year ?? "Not provided"} – {profile.kq_end_year ?? "Not provided"}</dd><dt>Current position</dt><dd>{profile.current_job_title || "Not provided"}</dd><dt>Current organization</dt><dd>{profile.current_organization || "Not provided"}</dd><dt>Industry</dt><dd>{profile.industry || "Not provided"}</dd><dt>Location</dt><dd>{profile.location || "Not provided"}</dd></dl><p className="small muted">Professional profiles are shared within the verified Lumina community. Mentorship availability is separate from directory visibility. Messaging and connection requests are not available yet.</p></section></div>
    <section className="card work-history"><h2>Work experience</h2>{profile.experience.length ? <ol>{profile.experience.map((work,index) => <li key={index}><h3>{work.job_title}</h3><p>{work.organization}</p><p className="small muted">{work.start_date?.slice(0,7) || "Start date not added"} &ndash; {work.is_current ? "Present" : work.end_date?.slice(0,7) || "End date not added"}</p>{work.description && <p className="profile-biography">{work.description}</p>}</li>)}</ol> : <p className="muted">Work experience has not been added yet.</p>}</section>
    {profile.synthetic && <p className="preview-notice">This is a fictional profile from Lumina’s synthetic alumni dataset, used to demonstrate real mentor search. It is not a real Kenya Airways employee record.</p>}
  </div>;
}
