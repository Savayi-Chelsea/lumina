import { requireAdmin } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
 const session = await requireAdmin();
 return <AppShell user={session.user} admin>{children}</AppShell>;
}
