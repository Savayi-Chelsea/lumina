import { notFound } from "next/navigation";
import Link from "next/link";
import { getOpportunity, opportunityApplicants } from "@/lib/community";
import { formatDate } from "@/lib/community-input";
import { OpportunityForm } from "@/components/admin-community-forms";
import { PublicationControls, StatusBadge } from "@/components/admin-community";

export const dynamic = "force-dynamic";

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunity = await getOpportunity(id, true);
  if (!opportunity) notFound();
  const applicants = await opportunityApplicants(opportunity.id);
  const { title, organization, opportunity_type, work_mode, location, industry, summary, description, how_to_apply, closes_on } = opportunity;
  return <>
    <p className="eyebrow">Administration / Opportunities</p>
    <div className="admin-heading"><h1>Edit opportunity</h1><StatusBadge status={opportunity.status} /></div>
    <PublicationControls kind="opportunities" id={opportunity.id} status={opportunity.status} edit={false} />
    <OpportunityForm initial={{ id: opportunity.id, title, organization, opportunity_type, work_mode, location, industry, summary, description, how_to_apply, closes_on }} published={opportunity.status === "published"} />
    <section className="card admin-attendees" id="applicants"><h2>Applicants ({applicants.length})</h2>
      <p className="small muted">Members who applied through Lumina. Contact shortlisted applicants by email.</p>
      {applicants.length ? <ul>{applicants.map(person => <li key={person.email} className="admin-applicant">
        <strong>{person.profile_id ? <Link href={`/alumni/${person.profile_id}`}>{person.full_name || "Name not added"}</Link> : person.full_name || "Name not added"}</strong>
        {person.synthetic ? <span className="muted">Sample applicant</span> : <a href={`mailto:${person.email}`}>{person.email}</a>}
        <span className="small muted">{[person.current_job_title, person.current_organization].filter(Boolean).join(" · ") || person.headline || "No current role listed"} · applied {formatDate(person.created_at)}</span>
        {person.note && <blockquote className="application-note">{person.note}</blockquote>}
      </li>)}</ul> : <p className="muted">No one has applied yet.</p>}
    </section>
  </>;
}
