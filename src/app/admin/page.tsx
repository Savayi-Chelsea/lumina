import Link from "next/link";
import { pendingRequests } from "@/lib/verification";

export default async function AdminPage() {
  const requests = await pendingRequests();
  return <>
    <p className="eyebrow">Lumina administration</p><h1>Community stewardship</h1>
    <section className="card"><h2>{requests.length} open verification exceptions</h2>
      <p>Alumni verification runs automatically against the prototype registry. Administrators assist only when a user requests help.</p>
      <Link className="button" href="/admin/verification">Review assistance requests</Link>
    </section>
  </>;
}
