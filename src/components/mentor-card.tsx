import Link from "next/link";
import type { MentorMatch } from "@/lib/mentorship-contract";
import { Icon } from "./icon";

export function MentorCard({ mentor, rank }: { mentor: MentorMatch; rank: number }) {
  const initials = mentor.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  return <article className="live-mentor-card">
    <div className="mentor-card-top"><span className="mentor-initials" aria-hidden="true">{initials}</span><div className="relevance"><span>Match relevance</span><strong>{mentor.matchRelevance.toFixed(3)}</strong></div></div>
    <div className="mentor-labels"><span className="availability"><Icon name="check" width={14} height={14} />Available for mentorship</span></div>
    <p className="eyebrow">{mentor.department || "Alumni experience"}</p><h3>{mentor.name}</h3>
    <p className="mentor-headline">{mentor.headline || "Professional profile"}</p>
    <dl className="mentor-career"><dt>Former KQ role</dt><dd>{mentor.formerRole || "Not provided"}</dd><dt>Former KQ department</dt><dd>{mentor.department || "Not provided"}</dd><dt>Current position</dt><dd>{mentor.currentPosition || "Not provided"}</dd><dt>Organization</dt><dd>{mentor.organization || "Not provided"}</dd></dl>
    {mentor.reasons?.length ? <div className="match-reasons"><h4>Why this match</h4><ul>{mentor.reasons.map(reason => <li key={reason}><Icon name="check" width={14} height={14} />{reason}</li>)}</ul></div> : null}
    <div className="mentor-skills"><h4>Relevant skills</h4>{mentor.skills.length ? <ul>{mentor.skills.map(skill => <li key={skill}>{skill}</li>)}</ul> : <p className="small muted">No skills listed yet.</p>}</div>
    <div className="mentor-card-footer"><span className="small muted">Result {rank}</span><Link className="text-link" href={`/mentorship/request/${mentor.profileId}`}>Request mentorship</Link><Link className="text-link" href={`/alumni/${mentor.profileId}?from=mentorship`}>View alumni profile<Icon name="arrow" /></Link></div>
  </article>;
}
