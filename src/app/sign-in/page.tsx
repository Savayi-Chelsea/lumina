import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleSignInButton } from "@/components/auth-controls";
import { isGoogleAuthConfigured } from "@/lib/auth-environment";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const configured = isGoogleAuthConfigured();
  if (configured && (await auth())?.user) redirect("/account");
  const { error } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-6 py-20">
      <Link href="/" className="text-sm underline">Lumina</Link>
      <h1 className="text-3xl font-semibold">Sign in to Lumina</h1>
      <p>Use your Google account to continue. Personal Gmail accounts are welcome.</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Signing in does not verify that you are a Kenya Airways alumnus.
      </p>
      {(!configured || error === "unavailable") ? (
        <p role="alert">Google sign-in is temporarily unavailable. Please try again later.</p>
      ) : error ? (
        <p role="alert">We couldn’t sign you in. Try again or contact Lumina support if the problem continues.</p>
      ) : null}
      <GoogleSignInButton disabled={!configured} />
    </main>
  );
}
