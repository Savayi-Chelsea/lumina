import Link from "next/link";
import { AccountCard } from "@/components/account-card";
import { SignOutButton } from "@/components/auth-controls";
import { currentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-6 py-20">
      <p className="text-sm font-semibold tracking-widest uppercase">Lumina</p>
      <h1 className="text-4xl font-semibold">Connections that continue.</h1>
      <p className="text-lg text-zinc-600 dark:text-zinc-400">A place for Kenya Airways alumni to connect and share experience.</p>
      {session?.user ? (
        <>
          <AccountCard user={session.user} />
          <div className="flex items-center gap-6">
            <Link href="/account" className="font-medium underline">Your account</Link>
            <SignOutButton />
          </div>
        </>
      ) : (
        <>
          <Link href="/sign-in" className="inline-block rounded-full bg-zinc-900 px-6 py-3 font-medium text-white dark:bg-white dark:text-zinc-900">Sign in with Google</Link>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Personal Gmail accounts are welcome. Alumni verification is handled separately.</p>
        </>
      )}
    </main>
  );
}
