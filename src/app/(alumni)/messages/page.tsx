import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { listConversations } from "@/lib/messages";
import { DiscoveryGate } from "@/components/discovery-gate";
import { AlumniAvatar } from "@/components/alumni-avatar";
import { Icon } from "@/components/icon";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to message alumni." area="Messages are" />;
  const [conversations, { message }] = await Promise.all([listConversations(session.user.id), searchParams]);
  return <div className="messages-page">
    <section className="network-intro"><p className="eyebrow">STAY IN TOUCH</p><h1>Messages</h1><p>Message your connections and mentors.</p></section>
    {message === "unavailable" && <p className="card notice" role="status">You can message members once you&apos;re connected or in a mentorship together.</p>}
    {conversations.length ? <ul className="card conversation-list">{conversations.map(convo => <li key={convo.id}>
      <Link href={`/messages/${convo.id}`} className={convo.unread ? "unread" : undefined}>
        <AlumniAvatar name={convo.other_name || "Member"} image={convo.other_image} />
        <span className="conversation-text"><strong>{convo.other_name || "Lumina member"}</strong>
          <span className="small muted">{convo.last_sender_id === session.user.id ? "You: " : ""}{(convo.last_body || "").slice(0, 90)}</span></span>
        <span className="conversation-meta"><span className="small muted">{convo.last_message_at ? when.format(new Date(convo.last_message_at)) : ""}</span>{convo.unread > 0 && <span className="count-badge" aria-label={`${convo.unread} unread`}>{convo.unread}</span>}</span>
      </Link></li>)}</ul>
      : <div className="empty-state"><Icon name="message" width={32} height={32} /><h2>No conversations yet</h2><p>Connect with alumni, then message them from their profile or My network.</p><Link className="button secondary" href="/network/connections">Go to My network</Link></div>}
  </div>;
}
