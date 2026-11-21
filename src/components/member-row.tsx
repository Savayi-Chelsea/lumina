import Link from "next/link";
import type { ReactNode } from "react";
import { AlumniAvatar } from "./alumni-avatar";

/** Compact person row used across My network, messages and requests. */
export function MemberRow({ profileId, name, detail, image, from, children }: {
  profileId: string | null; name: string | null; detail?: string | null; image: string | null; from?: string; children?: ReactNode;
}) {
  const label = name || "Lumina member";
  return <li className="member-row">
    <AlumniAvatar name={label} image={image} />
    <div className="member-row-text">{profileId ? <Link href={`/alumni/${profileId}${from ? `?from=${from}` : ""}`}>{label}</Link> : <strong>{label}</strong>}
      {detail && <p className="small muted">{detail}</p>}</div>
    {children && <div className="member-row-actions">{children}</div>}
  </li>;
}

export function NetworkTabs({ current, invitations }: { current: "directory" | "connections"; invitations?: number }) {
  return <nav className="filter-chips network-tabs" aria-label="Network sections">
    <Link className={`chip${current === "directory" ? " chip-active" : ""}`} aria-current={current === "directory" ? "page" : undefined} href="/network">Directory</Link>
    <Link className={`chip${current === "connections" ? " chip-active" : ""}`} aria-current={current === "connections" ? "page" : undefined} href="/network/connections">My network{invitations ? ` (${invitations} new)` : ""}</Link>
  </nav>;
}
