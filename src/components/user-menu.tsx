"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Session } from "next-auth";
import { SignOutButton } from "./auth-controls";
import { Icon } from "./icon";

export function UserMenu({ user }: { user: Session["user"] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeEscape); };
  }, [open]);
  const initials = (user.name || "Lumina member").trim().split(/\s+/).slice(0, 2).map(value => value[0]).join("");
  return <div className="user-menu" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={button} type="button" className="user-menu-trigger" aria-label="Open account menu" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(!open)}>
      {user.image ? <Image className="avatar" src={user.image} alt="" width={38} height={38} unoptimized referrerPolicy="no-referrer" /> : <span className="avatar avatar-initials" aria-hidden="true">{initials}</span>}
      <Icon name="chevron" />
    </button>
    {open && <div id="account-menu" className="account-popover">
      <p className="menu-name">{user.name || "Lumina member"}</p>
      {user.email && <p className="menu-email">{user.email}</p>}
      <Link href="/account" onClick={() => setOpen(false)}>Account</Link>
      <Link href="/profile" onClick={() => setOpen(false)}>Your profile</Link>
      {user.role === "admin" && <Link href="/admin" onClick={() => setOpen(false)}>Administration</Link>}
      <SignOutButton />
    </div>}
  </div>;
}
