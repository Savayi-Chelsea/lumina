import Link from "next/link";
import { pendingRequests } from "@/lib/verification";
import { communityCounts } from "@/lib/community";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [requests, counts] = await Promise.all([pendingRequests(), communityCounts()]);
  return <>
    <p className="eyebrow">Lumina administration</p><h1>Community stewardship</h1>
    <div className="admin-stats">
      <section className="card"><h2>{requests.length} open verification exceptions</h2>
        <p>Alumni verification runs automatically against the alumni registry. Administrators assist only when a user requests help.</p>
        <Link className="button" href="/admin/verification">Review assistance requests</Link>
      </section>
      <section className="card"><h2>{counts.upcoming_events} upcoming events</h2>
        <p>{counts.registrations} {counts.registrations === 1 ? "place" : "places"} reserved by alumni.</p>
        <Link className="button secondary" href="/admin/events">Manage events</Link>
      </section>
      <section className="card"><h2>{counts.open_opportunities} open opportunities</h2>
        <p>{counts.drafts} {counts.drafts === 1 ? "draft" : "drafts"} across events and opportunities.</p>
        <Link className="button secondary" href="/admin/opportunities">Manage opportunities</Link>
      </section>
    </div>
  </>;
}
