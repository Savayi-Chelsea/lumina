"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export function Navigation({ admin = false }: { admin?: boolean }) {
  const path = usePathname();
  const links = admin ? [["/admin", "Dashboard"], ["/admin/verification", "Verification Exceptions"], ["/admin/users", "Users"], ["/admin/events", "Events"], ["/admin/opportunities", "Opportunities"]] : [["/", "Home"], ["/network", "Network"], ["/mentorship", "Mentorship"], ["/events", "Events"], ["/opportunities", "Opportunities"], ["/profile", "Profile"]];
  return <nav aria-label={admin ? "Administration" : "Alumni navigation"}>{links.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined}>{label}</Link>)}</nav>;
}
