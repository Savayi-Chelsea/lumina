import { AppShell } from "@/components/app-shell";
import { AlumniHome } from "@/components/alumni-home";
import { LandingPage } from "@/components/landing-page";
import { currentSession } from "@/lib/session";
import { getProfile } from "@/lib/profiles";
import { isGoogleAuthConfigured } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (!session?.user) return <LandingPage configured={isGoogleAuthConfigured()} />;
  const profile = await getProfile(session.user.id);
  return <AppShell user={session.user}><AlumniHome user={session.user} profile={profile} /></AppShell>;
}
