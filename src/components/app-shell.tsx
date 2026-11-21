import type { Session } from "next-auth";
import Link from "next/link";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import { UserMenu } from "./user-menu";
import { LuminaLogo } from "./lumina-logo";
import { Icon } from "./icon";

export type ActivityCounts = { notifications: number; messages: number } | null;

function CountLink({ href, label, icon, count }: { href: string; label: string; icon: "bell" | "message"; count: number }) {
  const text = count ? `${label} (${count} unread)` : label;
  return <Link className="header-icon" href={href} aria-label={text} title={label}><Icon name={icon} width={22} height={22} />{count > 0 && <span className="count-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>}</Link>;
}
export function AppShell({ user, children, admin = false, counts = null }: { user: Session["user"]; children: React.ReactNode; admin?: boolean; counts?: ActivityCounts }) {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header"><div className="header-inner">
      <Brand /><Navigation />
      <div className="header-actions">{counts && <><CountLink href="/messages" label="Messages" icon="message" count={counts.messages} /><CountLink href="/notifications" label="Notifications" icon="bell" count={counts.notifications} /></>}{user.role === "admin" && <Link className="admin-access" href={admin ? "/" : "/admin"}>{admin ? "Alumni home" : "Admin"}</Link>}<UserMenu user={user} /></div>
    </div></header>
    {admin && <div className="admin-navigation"><span className="eyebrow">Administration</span><Navigation admin /></div>}
    <main id="main" className={`workspace${admin ? " admin-workspace" : ""}`}>{children}</main>
    <footer className="app-footer"><LuminaLogo variant="wordmark" /><p>Shared journeys. New horizons.</p><span>For the people behind the journey.</span></footer>
  </>;
}
