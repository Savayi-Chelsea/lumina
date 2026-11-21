import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { MESSAGE_MAX, readConversation } from "@/lib/messages";
import { DiscoveryGate } from "@/components/discovery-gate";
import { AlumniAvatar } from "@/components/alumni-avatar";
import { Icon } from "@/components/icon";
import { postMessage } from "../../social-actions";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
const errors: Record<string, string> = { invalid: "Write a message of up to 2,000 characters.", forbidden: "You can no longer message this member.", failed: "Your message could not be sent. Please try again." };

export default async function ConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to message alumni." area="Messages are" />;
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const conversation = await readConversation(session.user.id, id);
  if (!conversation) notFound();
  const name = conversation.other_name || "Lumina member";
  return <div className="conversation">
    <Link className="text-link back-link" href="/messages"><Icon name="arrow" className="flip" />All messages</Link>
    <header className="card conversation-header"><AlumniAvatar name={name} image={conversation.other_image} />
      <div>{conversation.other_profile_id ? <Link href={`/alumni/${conversation.other_profile_id}`}><h1>{name}</h1></Link> : <h1>{name}</h1>}{conversation.other_headline && <p className="small muted">{conversation.other_headline}</p>}</div></header>
    <ol className="card message-thread" aria-label={`Conversation with ${name}`}>
      {conversation.messages.map(message => <li key={message.id} className={message.sender_id === session.user.id ? "mine" : "theirs"}>
        <p className="bubble">{message.body}</p><span className="small muted">{message.sender_id === session.user.id ? "You" : name} · {when.format(new Date(message.created_at))}</span></li>)}
      {!conversation.messages.length && <li className="muted">Say hello to start the conversation.</li>}
    </ol>
    {error && errors[error] && <p className="auth-feedback" role="alert">{errors[error]}</p>}
    {conversation.canReply ? <form action={postMessage} className="card message-composer">
      <input type="hidden" name="conversation_id" value={conversation.id} />
      <label htmlFor="body" className="sr-only">Write a message</label>
      <textarea id="body" name="body" required maxLength={MESSAGE_MAX} placeholder={`Message ${name}`} />
      <button><Icon name="message" width={16} height={16} />Send</button>
    </form> : <p className="card muted">You can no longer reply in this conversation.</p>}
  </div>;
}
