import Link from "next/link";
import type { AlumniSummary } from "@/lib/alumni-directory";
import { AlumniAvatar } from "./alumni-avatar";
import { Icon } from "./icon";
export function AlumniCard({ profile, returnTo = "/network" }: { profile: AlumniSummary; returnTo?: string }) {
 return <article className="alumni-card">
   <div className="alumni-card-identity"><AlumniAvatar name={profile.full_name} image={profile.image} /><div><p className="eyebrow">{profile.former_kq_department || "Alumni community"}</p><h2><Link href={`/alumni/${profile.id}?from=${encodeURIComponent(returnTo)}`}>{profile.full_name}</Link></h2></div></div>
   {profile.synthetic && <span className="demo-label">Synthetic demo profile</span>}
   <p className="alumni-headline">{profile.headline || "A shared KQ journey. A new chapter."}</p>
   <dl className="mentor-career"><dt>Former KQ role</dt><dd>{profile.former_kq_role || "Not added yet"}</dd><dt>Now</dt><dd>{[profile.current_job_title, profile.current_organization].filter(Boolean).join(" at ") || "Professional details to come"}</dd>{profile.location && <><dt>Based in</dt><dd>{profile.location}</dd></>}</dl>
   {!!profile.skills.length && <ul className="profile-skills" aria-label="Skills">{profile.skills.slice(0, 4).map(skill => <li key={skill}>{skill}</li>)}{profile.skills.length > 4 && <li>+{profile.skills.length - 4} more</li>}</ul>}
   <div className="alumni-card-footer">{profile.mentorship_available && <span className="availability">Available for mentorship</span>}<Link className="text-link" href={`/alumni/${profile.id}?from=${encodeURIComponent(returnTo)}`} aria-label={`View profile: ${profile.full_name}`}>View profile<Icon name="arrow" /></Link></div>
 </article>;
}
