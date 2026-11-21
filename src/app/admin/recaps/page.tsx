import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { adminRecaps } from "@/lib/session-recaps";
import { RecapCard } from "@/components/recap-card";
import { moderateRecap } from "./actions";

export const dynamic = "force-dynamic";

const results: Record<string, string> = {
  hide: "Recap hidden. It no longer appears on profiles, Home or Session recaps.",
  restore: "Recap restored.",
  unchanged: "No change was made.",
};

export default async function AdminRecapsPage({ searchParams }: { searchParams: Promise<{ page?: string; result?: string }> }) {
  const session = await requireAdmin();
  const params = await searchParams;
  const requested = Number.parseInt(params.page || "1", 10);
  const { recaps, total, page, pages } = await adminRecaps(session.user.id, Number.isFinite(requested) ? requested : 1);
  const result = params.result ? results[params.result] : undefined;
  return <>
    <p className="eyebrow">Administration / Session recaps</p>
    <h1>Session recaps</h1>
    <p>Recaps are published only after both people agree. Hide any that break community guidelines; the people involved keep their mentorship.</p>
    {result && <p className="card notice" role="status">{result}</p>}
    <p className="results-count" role="status">{total} published {total === 1 ? "recap" : "recaps"} · {recaps.filter(r => r.hidden).length} hidden on this page</p>
    <div className="recap-feed">{recaps.map(recap => <RecapCard key={recap.id} recap={recap} footer={<>
      {recap.hidden && <span className="badge">Hidden</span>}
      <form action={moderateRecap}><input type="hidden" name="recap_id" value={recap.id} /><input type="hidden" name="page" value={page} />
        <button className="secondary" name="action" value={recap.hidden ? "restore" : "hide"}>{recap.hidden ? "Restore" : "Hide"}</button></form>
    </>} />)}</div>
    {total > 0 && <nav className="pagination" aria-label="Recap pages">{page > 1 ? <Link className="button secondary" href={`/admin/recaps?page=${page - 1}`}>Previous page</Link> : <span />}<span aria-current="page">Page {page} of {pages}</span>{page < pages ? <Link className="button secondary" href={`/admin/recaps?page=${page + 1}`}>Next page</Link> : <span />}</nav>}
  </>;
}
