import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { listUsers, parseUserFilters } from "@/lib/admin-users";
import { formatDate } from "@/lib/community-input";
import { changeAccountStatus } from "./actions";

export const dynamic = "force-dynamic";

const results: Record<string, string> = {
  suspend: "Account suspended. The person is signed out on their next request.",
  reinstate: "Account reinstated.",
  unchanged: "No change was made. Administrators and your own account cannot be changed here.",
};

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAdmin();
  const params = await searchParams;
  const filters = parseUserFilters(params);
  const { users, total, page, pages, summary } = await listUsers(filters);
  const href = (nextPage: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set("q", filters.q);
    if (filters.status) query.set("status", filters.status);
    if (nextPage > 1) query.set("page", String(nextPage));
    return `/admin/users${query.size ? `?${query}` : ""}`;
  };
  const result = typeof params.result === "string" ? results[params.result] : undefined;
  return <>
    <p className="eyebrow">Administration / Users</p>
    <h1>Users</h1>
    <p>{summary.active} active · {summary.pending} awaiting verification · {summary.suspended} suspended · {summary.verified} verified alumni</p>
    {result && <p className="card notice" role="status">{result}</p>}
    <form action="/admin/users" method="get" className="card admin-user-filters" role="search">
      <div className="field"><label htmlFor="users-q">Search by name or email</label><input id="users-q" type="search" name="q" maxLength={100} defaultValue={filters.q} /></div>
      <div className="field"><label htmlFor="users-status">Status</label><select id="users-status" name="status" defaultValue={filters.status || ""}><option value="">All statuses</option><option value="active">Active</option><option value="pending">Awaiting verification</option><option value="suspended">Suspended</option></select></div>
      <div className="actions"><button type="submit">Filter</button><Link className="button secondary" href="/admin/users">Clear</Link></div>
    </form>
    <p className="results-count" role="status">{total} {total === 1 ? "user" : "users"}</p>
    <div className="admin-list">{users.map(user => <article className="card admin-item" key={user.id}>
      <div className="admin-item-heading"><h2>{user.full_name || "Name not added"}</h2><div className="mentor-labels">
        <span className={`badge status-${user.account_status === "active" ? "published" : user.account_status === "suspended" ? "archived" : "draft"}`}>{user.account_status === "pending" ? "Awaiting verification" : user.account_status === "active" ? "Active" : "Suspended"}</span>
        {user.role === "admin" && <span className="badge">Administrator</span>}
        {user.alumni_verified && <span className="availability">Verified alumni</span>}
        {user.sign_in === "Sample" && <span className="badge">Seeded</span>}
      </div></div>
      <p className="muted">{user.email} · {user.sign_in === "Sample" ? "Seeded profile (no sign-in)" : `${user.sign_in} sign-in`} · Joined {formatDate(user.created_at)}</p>
      {user.role === "alumni" && user.id !== session.user.id && <form action={changeAccountStatus} className="actions">
        <input type="hidden" name="user_id" value={user.id} /><input type="hidden" name="return_to" value={href(page)} />
        {user.account_status === "suspended"
          ? <button className="secondary" name="action" value="reinstate">Reinstate account</button>
          : <button className="secondary" name="action" value="suspend">Suspend account</button>}
      </form>}
    </article>)}</div>
    {pages > 1 && <nav className="pagination" aria-label="User pages">{page > 1 ? <Link className="button secondary" href={href(page - 1)}>Previous page</Link> : <span />}<span aria-current="page">Page {page} of {pages}</span>{page < pages ? <Link className="button secondary" href={href(page + 1)}>Next page</Link> : <span />}</nav>}
  </>;
}
