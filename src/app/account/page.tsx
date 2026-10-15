import { AccountCard } from "@/components/account-card";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
 const session = await requireSession();
 return <AppShell user={session.user}><h1>Your account</h1><p>You’re signed in to Lumina with Google.</p><p>Administration requires an administrator role. Your role: {session.user.role}.</p><AccountCard user={session.user} />{session.user.role === "alumni" && (!session.user.alumniVerified || session.user.accountStatus === "pending") && <div className="actions"><Link className="button" href="/verify">Verify alumni details</Link></div>}</AppShell>;
}
