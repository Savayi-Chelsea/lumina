import Link from "next/link";

export function EditNav({ current }: { current: string }) {
  const sections = [["/profile/edit", "Intro & about"], ["/profile/edit/experience", "Experience"], ["/profile/edit/skills", "Skills"], ["/profile/edit/mentorship", "Mentorship"], ["/profile/edit/photo", "Photo"]];
  return <nav className="filter-chips" aria-label="Profile sections">{sections.map(([href, label]) => <Link key={href} className={`chip${current === href ? " chip-active" : ""}`} aria-current={current === href ? "page" : undefined} href={href}>{label}</Link>)}</nav>;
}
