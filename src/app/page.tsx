import { AppShell } from "@/components/app-shell";
import { AlumniHome } from "@/components/alumni-home";
import { LandingPage } from "@/components/landing-page";
import { currentSession } from "@/lib/session";
import { homeAlumni, type AlumniSummary } from "@/lib/alumni-directory";
import { listEvents, listOpportunities, type CommunityEvent, type Opportunity } from "@/lib/community";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session?.user) return <LandingPage />;
  const profile = await getProfile(session.user.id);
  let people: AlumniSummary[] = [];
  let events: CommunityEvent[] = [];
  let opportunities: Opportunity[] = [];
  let discoveryUnavailable = false;
  if (canDiscoverMentors(session.user)) {
    try { people = await homeAlumni(session.user.id, profile?.former_kq_department || null); }
    catch { discoveryUnavailable = true; console.error("Home alumni discovery unavailable"); }
    // Community listings are optional on Home; a failure must not block the page.
    [events, opportunities] = await Promise.all([
      listEvents(session.user.id, { view: "upcoming", format: null }, 3).catch(() => []),
      listOpportunities({ type: null, q: "" }, 3).catch(() => []),
    ]);
  }
  return <AppShell user={session.user}><AlumniHome user={session.user} profile={profile} people={people} events={events} opportunities={opportunities} discoveryUnavailable={discoveryUnavailable} /></AppShell>;
}
