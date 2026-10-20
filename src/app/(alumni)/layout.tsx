import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";
import { headerCounts } from "@/lib/activity";
export default async function AlumniLayout({ children }: { children: React.ReactNode }) {
 const session = await requireSession();
 return <AppShell user={session.user} counts={await headerCounts(session.user)}>{children}</AppShell>;
}
