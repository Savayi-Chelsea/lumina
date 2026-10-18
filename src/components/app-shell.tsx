import type { Session } from "next-auth";
import Link from "next/link";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import { UserMenu } from "./user-menu";
import { LuminaLogo } from "./lumina-logo";
export function AppShell({ user, children, admin = false }: { user: Session["user"]; children: React.ReactNode; admin?: boolean }) {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="app-header"><div className="header-inner">
      <Brand /><Navigation />
      <div className="header-actions">{user.role === "admin" && <Link className="admin-access" href={admin ? "/" : "/admin"}>{admin ? "Alumni home" : "Admin"}</Link>}<UserMenu user={user} /></div>
    </div></header>
    {admin && <div className="admin-navigation"><span className="eyebrow">Administration</span><Navigation admin /></div>}
    <main id="main" className={`workspace${admin ? " admin-workspace" : ""}`}>{children}</main>
    <footer className="app-footer"><LuminaLogo variant="wordmark" /><p>Shared journeys. New horizons.</p><span>For the people behind the journey.</span></footer>
  </>;
}
