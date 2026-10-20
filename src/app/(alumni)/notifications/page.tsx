import Link from "next/link";
import { requireSession } from "@/lib/session";
import { listNotifications, notificationText } from "@/lib/notifications";
import { AlumniAvatar } from "@/components/alumni-avatar";
import { Icon } from "@/components/icon";
import { profileImage } from "@/lib/profile-image";
import { readAllNotifications } from "../social-actions";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Nairobi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

export default async function NotificationsPage() {
  const session = await requireSession();
  const notifications = await listNotifications(session.user.id);
  const unread = notifications.filter(item => !item.read_at).length;
  return <div className="messages-page">
    <section className="network-intro"><p className="eyebrow">WHAT&apos;S NEW</p><h1>Notifications</h1>
      {unread > 0 && <form action={readAllNotifications}><button className="secondary">Mark all as read</button></form>}</section>
    {notifications.length ? <ul className="card conversation-list">{notifications.map(item => <li key={item.id}>
      <Link href={item.link} className={item.read_at ? undefined : "unread"}>
        <AlumniAvatar name={item.actor_name || "Lumina"} image={profileImage(item.actor_image)} />
        <span className="conversation-text"><span>{notificationText(item.kind, item.actor_name || "A member")}</span></span>
        <span className="conversation-meta"><span className="small muted">{when.format(new Date(item.created_at))}</span>{!item.read_at && <span className="dot" aria-label="Unread" />}</span>
      </Link></li>)}</ul>
      : <div className="empty-state"><Icon name="bell" width={32} height={32} /><h2>You&apos;re all caught up</h2><p>Invitations, messages and mentorship replies will appear here.</p></div>}
  </div>;
}
