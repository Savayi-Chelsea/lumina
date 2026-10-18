import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { MentorshipSearch } from "@/components/mentorship-search";
import { Icon } from "@/components/icon";

export default async function MentorshipPage() {
  const session = await requireSession();
  return <div className="mentorship-page"><section className="mentorship-intro"><p className="eyebrow">YOUR NEXT STEP. A SHARED PERSPECTIVE.</p><h1>Experience that helps<br /><em>your next chapter take flight.</em></h1><p>Tell us where you want to go. Discover alumni with the skills and experience to help you find your way.</p></section>
    {canDiscoverMentors(session.user) ? <MentorshipSearch /> : <section className="mentorship-gate card" aria-labelledby="mentorship-gate-title"><span className="prompt-icon"><Icon name="compass" width={32} height={32} /></span><h2 id="mentorship-gate-title">Your alumni journey starts with verification.</h2><p>Mentor search and mentor profiles are available to active, verified alumni and active administrators. Complete your alumni verification to discover mentors.</p><Link href="/verify" className="button">Verify alumni details<Icon name="arrow" /></Link><p className="small muted">If your details could not be resolved, you can retry or request assistance without losing access to your account.</p></section>}
  </div>;
}
