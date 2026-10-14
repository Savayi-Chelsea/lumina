import Link from "next/link";
import { AccountCard } from "@/components/account-card";
import { SignOutButton } from "@/components/auth-controls";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await requireSession();
  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-6 py-20">
      <Link href="/" className="text-sm underline">Lumina</Link>
      <h1 className="text-3xl font-semibold">Your account</h1>
      <p>You’re signed in to Lumina with Google.</p>
      <AccountCard user={session.user} />
      <SignOutButton />
    </main>
  );
}
