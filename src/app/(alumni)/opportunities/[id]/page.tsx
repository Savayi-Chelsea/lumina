import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { APPLICATION_NOTE_MAX, applicationFor, getOpportunity } from "@/lib/community";
import { WORK_MODES, formatDate } from "@/lib/community-input";
import { DiscoveryGate } from "@/components/discovery-gate";
import { Icon } from "@/components/icon";
import { changeApplication } from "../actions";

export const dynamic = "force-dynamic";

const messages: Record<string, { text: string; ok: boolean }> = {
  applied: { text: "Application sent. The Lumina team will contact you by email if you are shortlisted.", ok: true },
  already: { text: "You have already applied for this opportunity.", ok: true },
  withdrawn: { text: "Your application has been withdrawn.", ok: true },
  not_applied: { text: "You hadn't applied for this opportunity.", ok: false },
  closed: { text: "Applications for this opportunity are closed.", ok: false },
  too_long: { text: `Keep your note to ${APPLICATION_NOTE_MAX} characters or fewer.`, ok: false },
  failed: { text: "We couldn't update your application. Please try again.", ok: false },
};

export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ application?: string }> }) {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) return <DiscoveryGate title="Complete verification to explore opportunities." area="Opportunities are" />;
  const [{ id }, { application: outcome }] = await Promise.all([params, searchParams]);
  const opportunity = await getOpportunity(id, session.user.role === "admin");
  if (!opportunity) notFound();
  const application = await applicationFor(opportunity.id, session.user.id);
  const message = outcome ? messages[outcome] : undefined;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  const open = opportunity.status === "published" && (!opportunity.closes_on || opportunity.closes_on >= today);
  return <article className="community-detail">
    <Link className="text-link back-link" href="/opportunities"><Icon name="arrow" className="flip" />All opportunities</Link>
    {opportunity.status !== "published" && <p className="card notice" role="status">Admin preview · This listing is {opportunity.status} and not visible to alumni.</p>}
    <header className="community-detail-hero">
      <span className="opportunity-icon large"><Icon name="briefcase" width={32} height={32} /></span>
      <div><p className="eyebrow">{opportunity.opportunity_type} · {WORK_MODES[opportunity.work_mode]}</p><h1>{opportunity.title}</h1><p className="detail-summary">{opportunity.organization} · {opportunity.location}</p></div>
    </header>
    <div className="community-detail-grid">
      <section className="card"><h2>About the opportunity</h2><p className="detail-summary">{opportunity.summary}</p><p className="detail-description">{opportunity.description}</p></section>
      <aside className="card rsvp-card" aria-label="How to apply">
        <dl><dt>Organization</dt><dd>{opportunity.organization}</dd>{opportunity.industry && <><dt>Industry</dt><dd>{opportunity.industry}</dd></>}<dt>Closes</dt><dd>{opportunity.closes_on ? formatDate(opportunity.closes_on) : "Open until filled"}</dd></dl>
        <h2>How to apply</h2><p className="detail-description">{opportunity.how_to_apply}</p>
        {message && <p className={message.ok ? "auth-notice" : "auth-feedback"} role="status">{message.text}</p>}
        {application ? <form action={changeApplication} className="application-form">
            <input type="hidden" name="opportunity_id" value={opportunity.id} />
            <p className="availability"><Icon name="check" width={12} height={12} />You applied on {formatDate(application.created_at)}</p>
            {application.note && <blockquote className="application-note">{application.note}</blockquote>}
            {open && <button className="secondary" name="intent" value="withdraw">Withdraw application</button>}
          </form>
          : !open ? <p className="muted">Applications are not being accepted for this listing.</p>
          : <form action={changeApplication} className="application-form">
              <input type="hidden" name="opportunity_id" value={opportunity.id} />
              <div className="field"><label htmlFor="application-note">Note to the hiring contact (optional)</label>
                <textarea id="application-note" name="note" maxLength={APPLICATION_NOTE_MAX} rows={5} placeholder="Why this role interests you and the experience you would bring" /></div>
              <p className="field-hint">Your name, email address and Lumina profile are shared with the Lumina team managing this listing. Keep your profile up to date before applying.</p>
              <button name="intent" value="apply">Apply through Lumina</button>
            </form>}
      </aside>
    </div>
  </article>;
}
