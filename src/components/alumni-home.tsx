import Image from "next/image";
import Link from "next/link";
import type { Session } from "next-auth";
import type { Profile } from "@/lib/profiles";
import { profileProgress } from "@/lib/profile-progress";
import { demoEvents, demoOpportunities } from "@/lib/demo-community";
import { DemoLabel, EventCard, OpportunityCard } from "./community-cards";
import { HorizonArt } from "./horizon-art";
import { Icon } from "./icon";
import { AlumniCard } from "./alumni-card";
import type { AlumniSummary } from "@/lib/alumni-directory";

function SectionHeading({ id, eyebrow, title, href, link }: { id: string; eyebrow: string; title: string; href: string; link: string }) {
  return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2 id={id}>{title}</h2></div><Link className="text-link" href={href}>{link}<Icon name="arrow" /></Link></div>;
}

export function AlumniHome({ user, profile, people = [], discoveryUnavailable = false }: { people?: AlumniSummary[]; discoveryUnavailable?: boolean; user: Session["user"]; profile: Profile | null }) {
  const name = profile?.full_name || user.name || "Lumina member";
  const firstName = name.split(/\s+/)[0];
  const progress = profileProgress(profile);
  const verified = user.alumniVerified && user.accountStatus === "active";
  return <div className="alumni-home">
    <div className="home-masthead"><span className="eyebrow">THE ALUMNI EDIT</span><span>Familiar people. New possibilities.</span></div>
    <div className="welcome-layout"><section className="welcome-banner"><div className="welcome-copy"><p className="eyebrow">WELCOME BACK, {firstName.toUpperCase()}</p><h1>Your journey,<br /><em>still unfolding.</em></h1><p>A little inspiration. A familiar face.<br />Something new on the horizon.</p><a className="text-link" href="#mentor-preview">Discover your community<Icon name="arrow" /></a></div><HorizonArt compact /></section>
      <section className="profile-progress-card" aria-labelledby="profile-progress-title"><div className="self-profile">{user.image ? <Image src={user.image} alt="Your profile photo" className="avatar" width={48} height={48} unoptimized referrerPolicy="no-referrer" /> : <span className="avatar avatar-initials" aria-hidden="true">{name.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>}<div><h2>{name}</h2><p>{profile?.headline || "Your next chapter starts here"}</p></div></div>
        <span className={`verification-label${verified ? " is-verified" : ""}`}>{verified && <Icon name="check" width={14} height={14} />}{verified ? "Verified by Lumina" : "Not verified · Verification needed"}</span>
        <div className="progress-heading"><h3 id="profile-progress-title">Make it your space</h3><strong>{progress.percentage}%</strong></div><progress value={progress.completed} max={progress.total} aria-label="Profile details completed" /><p className="small muted">{progress.completed} of {progress.total} profile details added. Let people know where life has taken you.</p><Link className="text-link" href="/profile">{progress.percentage === 100 ? "Visit your profile" : "Complete your profile"}<Icon name="arrow" /></Link>
      </section>
    </div>
    {!verified && user.role !== "admin" && <section className="verification-prompt" aria-label="Alumni verification needed"><span className="prompt-icon"><Icon name="compass" /></span><div><h2>Let’s make your alumni journey official.</h2><p>Complete your alumni verification to establish your place in the community. Need help? You can retry or request assistance.</p></div><Link href="/verify" className="button secondary">Verify alumni details<Icon name="arrow" /></Link></section>}

    <section id="mentor-preview" className="discovery-section" aria-labelledby="mentors-heading"><SectionHeading id="mentors-heading" eyebrow="EXPERIENCE THAT OPENS DOORS" title="A little guidance goes a long way." href="/mentorship" link="Explore mentorship" />
      <div className="mentorship-entry card"><div><h3>A fresh perspective starts with a question.</h3><p>Describe your next step to find available mentors through real experience and skills. Results are ranked only after you submit a search.</p></div><Link className="button" href="/mentorship">Find a mentor<Icon name="arrow" /></Link></div>
    </section>

    <section className="discovery-section" aria-labelledby="alumni-heading"><SectionHeading id="alumni-heading" eyebrow="PICK UP WHERE YOU LEFT OFF" title="Explore alumni" href="/network" link="Explore the network" /><p className="section-description">Start with alumni from your former department, followed by recently added profiles.</p>{!verified && user.role !== "admin" ? <div className="card"><p>Verify your alumni details to explore the community professional profiles.</p><Link className="text-link" href="/verify">Complete verification<Icon name="arrow" /></Link></div> : discoveryUnavailable ? <div className="card"><p>Alumni discovery is temporarily unavailable. Please try the Network again shortly.</p><Link className="text-link" href="/network">Visit Network<Icon name="arrow" /></Link></div> : people.length ? <div className="alumni-grid">{people.map(person => <AlumniCard key={person.id} profile={person} />)}</div> : <div className="card"><p>Your community is taking shape. Verified alumni will appear here as they add their profiles.</p><Link className="text-link" href="/network">Explore the network<Icon name="arrow" /></Link></div>}</section>

    <section className="discovery-section" aria-labelledby="events-heading"><SectionHeading id="events-heading" eyebrow="MAKE ROOM FOR A REUNION" title="Good things on the horizon." href="/events" link="Explore events" /><div className="preview-caption"><DemoLabel /><p>Upcoming events preview · Sample gatherings, with dates and venues to be confirmed. No registration is open.</p></div><div className="event-grid">{demoEvents.map((event,index) => <EventCard key={event.id} event={event} index={index} />)}</div></section>

    <div className="home-bottom-grid"><section className="discovery-section" aria-labelledby="opportunities-heading"><SectionHeading id="opportunities-heading" eyebrow="YOUR EXPERIENCE HAS PLACES TO GO" title="What could come next?" href="/opportunities" link="Explore" /><div className="preview-caption"><DemoLabel /><p>Fictional opportunities · No live vacancies or applications.</p></div><div className="opportunity-list">{demoOpportunities.map(opportunity => <OpportunityCard key={opportunity.id} opportunity={opportunity} />)}</div></section>
      <section className="community-placeholder" aria-labelledby="community-heading"><span className="community-icon"><Icon name="people" width={30} height={30} /></span><p className="eyebrow">THE CONVERSATION CONTINUES</p><h2 id="community-heading">Stories worth<br /><em>staying close to.</em></h2><p>A space for shared milestones, fresh perspectives and familiar voices.</p><span className="badge">Community activity · Coming soon</span><p className="small muted">There is no live activity feed yet. For now, discover the people and possibilities around you.</p><Link className="text-link" href="/network">Meet the community<Icon name="arrow" /></Link></section>
    </div>
    <div className="home-signoff"><span className="eyebrow">ONCE PART OF THE JOURNEY. ALWAYS PART OF THE STORY.</span></div>
  </div>;
}
