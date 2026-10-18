import Link from "next/link";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { directoryOptions, searchAlumni } from "@/lib/alumni-directory";
import { directoryHref, DirectoryQueryError, parseDirectoryQuery, type SearchParameters } from "@/lib/network-query";
import { AlumniCard } from "@/components/alumni-card";
import { DiscoveryGate } from "@/components/discovery-gate";

export default async function NetworkPage({ searchParams }: { searchParams: Promise<SearchParameters> }) {
 const session = await requireSession();
 if (!canDiscoverMentors(session.user)) return <DiscoveryGate />;
 let query;
 try { query = parseDirectoryQuery(await searchParams); } catch (error) {
   if (!(error instanceof DirectoryQueryError)) throw error;
   return <section className="card"><h1>Check your Network filters</h1><p role="alert">{error.message}</p><Link className="button secondary" href="/network">Clear filters</Link></section>;
 }
 const [result, options] = await Promise.all([searchAlumni(query), directoryOptions()]);
 const returnTo = directoryHref(query, result.page);
 return <div className="network-page"><section className="network-intro"><p className="eyebrow">FAMILIAR PEOPLE. NEW POSSIBILITIES.</p><h1>A world of shared experience.</h1><p>Find your people, discover their next chapter, and reconnect through the experiences you share.</p></section>
   <form action="/network" method="get" className="network-filters card" aria-label="Search alumni">
    <div className="field network-search"><label htmlFor="network-q">Search alumni</label><input id="network-q" type="search" name="q" maxLength={150} defaultValue={query.q} placeholder="Name, role, headline or organization" /></div>
    {([ ["department", "Former KQ department"], ["industry", "Current industry"], ["skill", "Skill"], ["location", "Location"] ] as const).map(([key,label]) => <div className="field" key={key}><label htmlFor={`network-${key}`}>{label}</label><select id={`network-${key}`} name={key} defaultValue={query[key]}><option value="">All {key === "skill" ? "skills" : key === "industry" ? "industries" : key === "location" ? "locations" : "departments"}</option>{query[key] && !options[key].includes(query[key]) && <option value={query[key]}>{query[key]}</option>}{options[key].map(value => <option key={value} value={value}>{value}</option>)}</select></div>)}
    <div className="actions"><button type="submit">Find alumni</button><Link className="button secondary" href="/network">Clear filters</Link></div>
   </form>
   <div className="network-summary"><p role="status"><strong>{result.total}</strong> {result.total === 1 ? "alumnus" : "alumni"} found</p><p className="small muted">Professional profiles from the Lumina community</p></div>
   {result.profiles.length ? <div className="alumni-grid">{result.profiles.map(profile => <AlumniCard key={profile.id} profile={profile} returnTo={returnTo} />)}</div> : <section className="empty-state"><h2>No alumni found</h2><p>Try a broader search or clear your filters. New profiles will appear as alumni complete verification and add their name.</p><Link className="button secondary" href="/network">Clear filters</Link></section>}
   {result.total > 0 && <nav className="pagination" aria-label="Directory pages">{result.page > 1 ? <Link className="button secondary" href={directoryHref(query, result.page - 1)}>Previous page</Link> : <span /> }<span aria-current="page">Page {result.page} of {result.pages}</span>{result.page < result.pages ? <Link className="button secondary" href={directoryHref(query, result.page + 1)}>Next page</Link> : <span />}</nav>}
 </div>;
}
