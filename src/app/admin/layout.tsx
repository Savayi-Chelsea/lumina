import { requireAdmin } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { headerCounts } from "@/lib/activity";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
 const session = await requireAdmin();
 return <AppShell user={session.user} admin counts={await headerCounts(session.user)}>{children}</AppShell>;
}
