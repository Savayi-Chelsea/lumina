import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeading, AuthShell, ContinueWithGoogle } from "@/components/auth-shell";
import { SignInForm } from "@/components/auth-forms";
import { isAuthConfigured, isGoogleAuthConfigured } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

// Only fixed copy is rendered; the raw query value never reaches the page.
function notice(error: string | undefined, registered: boolean) {
  if (error === "account-exists") return "This email already has a Lumina password account. Sign in with your email and password.";
  if (error === "unavailable") return "Google sign-in is temporarily unavailable. Please try again later.";
  if (error) return "We could not sign you in. Try again or contact Lumina support if the problem continues.";
  if (registered) return "Your account is ready. Sign in to continue.";
  return null;
}

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[]; registered?: string | string[] }>;
}) {
  if (isAuthConfigured() && (await auth())?.user) redirect("/onboarding");
  const { error, registered } = await searchParams;
  const message = notice(Array.isArray(error) ? error[0] : error, registered === "1");

  return <AuthShell>
    <AuthHeading eyebrow="WELCOME BACK" title={<>Sign in to <em>Lumina.</em></>}>Pick up where you left off with the people who shaped your journey.</AuthHeading>
    {message && <p className={error ? "auth-feedback" : "auth-notice"} role={error ? "alert" : "status"}>{message}</p>}
    <SignInForm />
    <ContinueWithGoogle available={isGoogleAuthConfigured()} />
    <p className="auth-switch">New to Lumina? <Link className="text-link" href="/sign-up">Create an account</Link></p>
  </AuthShell>;
}
