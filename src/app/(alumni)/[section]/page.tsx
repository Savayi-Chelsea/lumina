import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { CommunityExplorer, type CommunitySection } from "@/components/community-explorer";
const sections: Record<string,string> = { events: "Events", opportunities: "Opportunities" };
export default async function FuturePage({ params }: { params: Promise<{ section: string }> }) {
 await requireSession();
 const { section } = await params;
 const title = sections[section];
 if (!title) notFound();
 return <CommunityExplorer key={section} section={section as CommunitySection} />;
}
