import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthHeading, AuthShell, ContinueWithGoogle } from "@/components/auth-shell";
import { SignUpForm } from "@/components/auth-forms";
import { isAuthConfigured, isGoogleAuthConfigured } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  if (isAuthConfigured() && (await auth())?.user) redirect("/onboarding");
  return <AuthShell>
    <AuthHeading eyebrow="JOIN THE COMMUNITY" title={<>Create your <em>Lumina</em> account.</>}>Reconnect with former colleagues and find people whose experience can guide your next step.</AuthHeading>
    <SignUpForm />
    <ContinueWithGoogle available={isGoogleAuthConfigured()} />
    <p className="auth-switch">Already have an account? <Link className="text-link" href="/sign-in">Sign in</Link></p>
  </AuthShell>;
}
