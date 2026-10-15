import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
export default async function AdminFuturePage({ params }: { params: Promise<{ section: string }> }) {
 await requireAdmin();
 const { section } = await params;
 const titles: Record<string, string> = { users: "Users", events: "Events", opportunities: "Opportunities" };
 if (!titles[section]) notFound();
 return <><p className="eyebrow">Administration</p><h1>{titles[section]}</h1><section className="card"><h2>Coming in a future milestone</h2><p>This administration area is a placeholder. Management actions are not available yet.</p></section></>;
}
