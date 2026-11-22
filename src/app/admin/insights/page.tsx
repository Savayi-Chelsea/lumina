import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { CommunityInsights } from "./community";
import { MatchingInsights } from "./matching";

export const dynamic = "force-dynamic";

const VIEWS = [["community", "Community"], ["matching", "Match quality"]] as const;

/** Community analytics and mentor match quality, as two tabs of one page. */
export default async function AdminInsightsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdmin();
  const view = (await searchParams).view === "matching" ? "matching" : "community";
  return <>
    <p className="eyebrow">Administration / Insights</p>
    <h1>Insights</h1>
    <nav className="page-tabs" aria-label="Insights">
      {VIEWS.map(([key, label]) => <Link key={key} href={key === "community" ? "/admin/insights" : `/admin/insights?view=${key}`} aria-current={view === key ? "page" : undefined}>{label}</Link>)}
    </nav>
    {view === "matching" ? <MatchingInsights /> : <CommunityInsights />}
  </>;
}
