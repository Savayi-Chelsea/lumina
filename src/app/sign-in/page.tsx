import { LandingPage } from "@/components/landing-page";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isGoogleAuthConfigured } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const configured = isGoogleAuthConfigured();
  if (configured && (await auth())?.user) redirect("/onboarding");
  const { error } = await searchParams;

  return <LandingPage signIn configured={configured} error={error} />;
}
