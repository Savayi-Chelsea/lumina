import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { AUDIT_ACTIONS, listAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ action?: string; page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const requested = Number.parseInt(params.page || "1", 10);
  const { entries, total, page, pages, action } = await listAudit({ action: params.action || null, page: Number.isFinite(requested) ? requested : 1 });
  const href = (next: number) => `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), ...(next > 1 ? { page: String(next) } : {}) })}`;
  return <>
    <p className="eyebrow">Administration / Audit log</p>
    <h1>Audit log</h1>
    <p>Every administrative action and account deletion, newest first. Entries can&apos;t be edited or removed, even by administrators.</p>
    <form action="/admin/audit" method="get" className="card admin-user-filters">
      <div className="field"><label htmlFor="audit-action">Action</label><select id="audit-action" name="action" defaultValue={action || ""}>
        <option value="">All actions</option>{Object.entries(AUDIT_ACTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="actions"><button type="submit">Filter</button><Link className="button secondary" href="/admin/audit">Clear</Link></div>
    </form>
    <p className="results-count" role="status">{total} {total === 1 ? "entry" : "entries"}</p>
    {entries.length ? <div className="card table-card"><div className="table-scroll"><table><thead><tr><th scope="col">When (Nairobi)</th><th scope="col">Who</th><th scope="col">What</th><th scope="col">Target</th><th scope="col">Details</th></tr></thead>
      <tbody>{entries.map(entry => <tr key={entry.id}>
        <td>{when.format(new Date(entry.created_at))}</td>
        <td>{entry.actor_name || entry.actor_email || <span className="muted">Deleted account</span>}</td>
        <td>{AUDIT_ACTIONS[entry.action] || entry.action}</td>
        <td>{entry.target_type}{entry.target_id ? <code className="small"> {entry.target_id.slice(0, 8)}</code> : ""}</td>
        <td className="small">{Object.entries(entry.details || {}).map(([key, value]) => `${key.replace(/_/g, " ")}: ${String(value)}`).join(" · ") || "—"}</td>
      </tr>)}</tbody></table></div></div> : <p className="card muted">No entries yet.</p>}
    {total > 0 && <nav className="pagination" aria-label="Audit pages">{page > 1 ? <Link className="button secondary" href={href(page - 1)}>Previous page</Link> : <span />}<span aria-current="page">Page {page} of {pages}</span>{page < pages ? <Link className="button secondary" href={href(page + 1)}>Next page</Link> : <span />}</nav>}
  </>;
}
