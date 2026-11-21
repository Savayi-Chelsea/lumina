import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { recapFeed } from "@/lib/session-recaps";
import { DiscoveryGate } from "@/components/discovery-gate";
import { RecapCard } from "@/components/recap-card";

export const dynamic = "force-dynamic";

export default async function RecapsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to read session recaps." area="Session recaps are" />;
  const requested = Number.parseInt((await searchParams).page || "1", 10);
  const feed = await recapFeed(session.user.id, Number.isFinite(requested) ? requested : 1);
  const here = feed.page > 1 ? `/recaps?page=${feed.page}` : "/recaps";
  return <div className="network-page">
    <section className="network-intro"><p className="eyebrow">LEARNING, PASSED ON</p><h1>Session recaps</h1>
      <p>What alumni worked through together in mentoring sessions. Every recap is confirmed by both people before it&apos;s shared.</p>
      <div className="actions"><Link className="button" href="/recaps/new">Share a session recap</Link><Link className="button secondary" href="/mentorship">Find a mentor</Link></div></section>
    {feed.recaps.length ? <div className="recap-feed">{feed.recaps.map(recap => <RecapCard key={recap.id} recap={recap} returnTo={here} />)}</div>
      : <p className="card">No recaps yet. After a mentoring session, share what you covered so others can learn from it too.</p>}
    {feed.total > 0 && <nav className="pagination" aria-label="Recap pages">{feed.page > 1 ? <Link className="button secondary" href={`/recaps?page=${feed.page - 1}`}>Previous page</Link> : <span />}<span aria-current="page">Page {feed.page} of {feed.pages}</span>{feed.page < feed.pages ? <Link className="button secondary" href={`/recaps?page=${feed.page + 1}`}>Next page</Link> : <span />}</nav>}
  </div>;
}
