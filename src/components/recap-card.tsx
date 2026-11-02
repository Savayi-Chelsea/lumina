import Link from "next/link";
import type { ReactNode } from "react";
import type { Recap } from "@/lib/session-recaps";
import { formatDate } from "@/lib/community-input";
import { reactToRecap } from "@/app/(alumni)/social-actions";
import { AlumniAvatar } from "./alumni-avatar";
import { Icon } from "./icon";

/** A published mentoring-session recap, co-signed by mentor and mentee. */
export function RecapCard({ recap, returnTo, compact = false, footer }: { recap: Recap; returnTo?: string; compact?: boolean; footer?: ReactNode }) {
  const sessionDay = formatDate(`${recap.session_date}T12:00:00Z`);
  return <article className={`card recap-card${compact ? " recap-compact" : ""}`} aria-labelledby={`recap-${recap.id}`}>
    <div className="recap-people">
      <span className="recap-avatars" aria-hidden="true"><AlumniAvatar name={recap.mentor.name} image={recap.mentor.image} /><AlumniAvatar name={recap.mentee.name} image={recap.mentee.image} /></span>
      <p className="small"><Link href={`/alumni/${recap.mentor.profile_id}`}>{recap.mentor.name}</Link> mentored <Link href={`/alumni/${recap.mentee.profile_id}`}>{recap.mentee.name}</Link>
        <span className="muted"> · Session on {sessionDay}</span></p>
    </div>
    <h3 id={`recap-${recap.id}`}>{recap.topic}</h3>
    <p className={compact ? "recap-text clamp" : "recap-text"}>{recap.takeaways}</p>
    <div className="recap-footer">
      <span className="small muted"><Icon name="check" width={14} height={14} /> Confirmed by both</span>
      {returnTo ? <form action={reactToRecap}><input type="hidden" name="recap_id" value={recap.id} /><input type="hidden" name="return_to" value={returnTo} />
        <button className={`reaction${recap.reacted ? " is-active" : ""}`} aria-pressed={recap.reacted}>Insightful · {recap.reactions}</button></form>
        : <span className="small muted">{recap.reactions} found this insightful</span>}
      {footer}
    </div>
  </article>;
}

/** "Mentoring sessions" section on a profile; hidden when there is nothing to show. */
export function RecapSection({ recaps, returnTo, own = false }: { recaps: Recap[]; returnTo: string; own?: boolean }) {
  if (!recaps.length && !own) return null;
  return <section className="card li-section">
    <div className="li-section-head"><h2>Mentoring sessions</h2>{own && <Link className="icon-link" href="/recaps/new" aria-label="Share a session recap" title="Share a session recap"><Icon name="plus" width={18} height={18} /></Link>}</div>
    {recaps.length ? <div className="recap-stack">{recaps.map(recap => <RecapCard key={recap.id} recap={recap} returnTo={returnTo} compact />)}</div>
      : <p className="muted">After a mentoring session, share a recap. Once the other person approves it, it appears here.</p>}
  </section>;
}
