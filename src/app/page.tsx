import { AppShell } from "@/components/app-shell";
import { AlumniHome } from "@/components/alumni-home";
import { LandingPage } from "@/components/landing-page";
import { currentSession } from "@/lib/session";
import { homeAlumni, type AlumniSummary } from "@/lib/alumni-directory";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { getProfile } from "@/lib/profiles";
import { isGoogleAuthConfigured } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session?.user) return <LandingPage configured={isGoogleAuthConfigured()} />;
  const profile = await getProfile(session.user.id);
  let people: AlumniSummary[] = [];
  let discoveryUnavailable = false;
  if (canDiscoverMentors(session.user)) {
    try { people = await homeAlumni(session.user.id, profile?.former_kq_department || null); }
    catch { discoveryUnavailable = true; console.error("Home alumni discovery unavailable"); }
  }
  return <AppShell user={session.user}><AlumniHome user={session.user} profile={profile} people={people} discoveryUnavailable={discoveryUnavailable} /></AppShell>;
}
