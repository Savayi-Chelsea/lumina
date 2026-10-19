import { notFound } from "next/navigation";
import { getOpportunity } from "@/lib/community";
import { OpportunityForm } from "@/components/admin-community-forms";
import { PublicationControls, StatusBadge } from "@/components/admin-community";

export const dynamic = "force-dynamic";

export default async function EditOpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const opportunity = await getOpportunity(id, true);
  if (!opportunity) notFound();
  const { title, organization, opportunity_type, work_mode, location, industry, summary, description, how_to_apply, closes_on } = opportunity;
  return <>
    <p className="eyebrow">Administration / Opportunities</p>
    <div className="admin-heading"><h1>Edit opportunity</h1><StatusBadge status={opportunity.status} /></div>
    <PublicationControls kind="opportunities" id={opportunity.id} status={opportunity.status} edit={false} />
    <OpportunityForm initial={{ id: opportunity.id, title, organization, opportunity_type, work_mode, location, industry, summary, description, how_to_apply, closes_on }} published={opportunity.status === "published"} />
  </>;
}
