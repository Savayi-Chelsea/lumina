import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { MentorsForYou } from "@/components/mentors-for-you";
import { AlumniHome } from "@/components/alumni-home";
import { LandingPage } from "@/components/landing-page";
import { currentSession } from "@/lib/session";
import { homeAlumni, type AlumniSummary } from "@/lib/alumni-directory";
import { listEvents, listOpportunities, type CommunityEvent, type Opportunity } from "@/lib/community";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { getProfile } from "@/lib/profiles";
import { headerCounts } from "@/lib/activity";
import { myNetwork } from "@/lib/social";
import { mentorshipRequests } from "@/lib/mentorship-requests";
import { pendingRecapCount, recapFeed, type Recap } from "@/lib/session-recaps";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session?.user) return <LandingPage />;
  const profile = await getProfile(session.user.id);
  let people: AlumniSummary[] = [];
  let events: CommunityEvent[] = [];
  let opportunities: Opportunity[] = [];
  let recaps: Recap[] = [];
  let discoveryUnavailable = false;
  if (canDiscoverMentors(session.user)) {
    try { people = await homeAlumni(session.user.id, profile?.former_kq_department || null); }
    catch { discoveryUnavailable = true; console.error("Home alumni discovery unavailable"); }
    // Community listings are optional on Home; a failure must not block the page.
    [events, opportunities, recaps] = await Promise.all([
      listEvents(session.user.id, { view: "upcoming", format: null }, 3).catch(() => []),
      listOpportunities({ type: null, q: "" }, 3).catch(() => []),
      recapFeed(session.user.id, 1, 3).then(feed => feed.recaps).catch(() => []),
    ]);
  }
  const counts = await headerCounts(session.user);
  const summary = counts ? await Promise.all([myNetwork(session.user.id), mentorshipRequests(session.user.id), pendingRecapCount(session.user.id)])
    .then(([network, requests, recapsWaiting]) => ({ connections: network.connections.length, invitations: network.incoming.length, mentorshipWaiting: requests.incoming.filter(r => r.status === "pending").length, messages: counts.messages, recapsWaiting }))
    .catch(() => null) : null;
  return <AppShell user={session.user} counts={counts}><AlumniHome summary={summary} recaps={recaps} recommendations={canDiscoverMentors(session.user) && session.user.role !== "admin" ? <Suspense fallback={null}><MentorsForYou userId={session.user.id} /></Suspense> : null} user={session.user} profile={profile} people={people} events={events} opportunities={opportunities} discoveryUnavailable={discoveryUnavailable} /></AppShell>;
}
