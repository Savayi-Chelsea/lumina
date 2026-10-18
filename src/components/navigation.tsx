"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
export function Navigation({ admin = false }: { admin?: boolean }) {
 const path = usePathname();
 const [open, setOpen] = useState(false);
 const root = useRef<HTMLDivElement>(null);
 const trigger = useRef<HTMLButtonElement>(null);
 const id = useId();
 useEffect(() => {
   if (!open) return;
   const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
   const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
   document.addEventListener("keydown", escape); document.addEventListener("pointerdown", outside);
   return () => { document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
 }, [open]);
 const links = admin ? [["/admin", "Dashboard"], ["/admin/verification", "Verification Exceptions"], ["/admin/users", "Users"], ["/admin/events", "Events"], ["/admin/opportunities", "Opportunities"]] : [["/", "Home"], ["/network", "Network"], ["/mentorship", "Mentorship"], ["/events", "Events"], ["/opportunities", "Opportunities"], ["/profile", "Profile"]];
 return <div ref={root} className={`navigation-disclosure${admin ? " navigation-admin" : ""}`} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
   <button className="navigation-toggle secondary" ref={trigger} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} type="button">{admin ? "Admin menu" : "Menu"}<span aria-hidden="true">{open ? "−" : "+"}</span></button>
   <nav id={id} className={open ? "navigation-open" : ""} aria-label={admin ? "Administration" : "Alumni navigation"}>{links.map(([href,label]) => <Link key={href} href={href} aria-current={path === href || (href !== "/" && href !== "/admin" && path.startsWith(`${href}/`)) ? "page" : undefined} onClick={() => { setOpen(false); trigger.current?.focus(); }}>{label}</Link>)}</nav>
 </div>;
}
