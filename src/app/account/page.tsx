import { AccountCard } from "@/components/account-card";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
 const session = await requireSession();
 return <AppShell user={session.user}><h1>Your account</h1><p>You’re signed in to Lumina. Your role: {session.user.role}.</p><AccountCard user={session.user} /><section className="card"><h2>Privacy and data</h2><p>Choose who can see your profile, manage email, download your data or delete your account.</p><Link className="button secondary" href="/account/privacy">Privacy and data</Link></section>{session.user.role === "alumni" && (!session.user.alumniVerified || session.user.accountStatus === "pending") && <div className="actions"><Link className="button" href="/verify">Verify alumni details</Link></div>}</AppShell>;
}
