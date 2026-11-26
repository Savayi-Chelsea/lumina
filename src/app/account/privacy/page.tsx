import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { Icon } from "@/components/icon";
import { requireSession } from "@/lib/session";
import { headerCounts } from "@/lib/activity";
import { database } from "@/lib/db";
import { consentHistory, PRIVACY_POLICY_VERSION, privacySettings } from "@/lib/privacy";
import { formatDate } from "@/lib/community-input";
import { updatePrivacy } from "../actions";

export const dynamic = "force-dynamic";

const consentLabels: Record<string, string> = {
  mentor_matching: "Mentor matching", directory_listing: "Directory listing", profile_visibility: "Profile visibility",
  weekly_digest: "Weekly email digest", session_emails: "Session emails",
};

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const session = await requireSession();
  const [settings, history, counts, { saved }, account] = await Promise.all([
    privacySettings(session.user.id), consentHistory(session.user.id), headerCounts(session.user), searchParams,
    database().query<{ has_password: boolean }>("SELECT password_hash IS NOT NULL AS has_password FROM users WHERE id = $1", [session.user.id]).then(r => r.rows[0]),
  ]);
  return <AppShell user={session.user} counts={counts}><div className="network-page privacy-page">
    <Link className="text-link back-link" href="/account"><Icon name="arrow" className="flip" />Back to your account</Link>
    <section className="network-intro"><p className="eyebrow">YOUR DATA, YOUR CHOICE</p><h1>Privacy and data</h1>
      <p>Choose who can find and see you, and what Lumina may email you. Every choice is recorded with the date and policy version, as the Kenya Data Protection Act 2019 requires.</p></section>
    {saved === "1" && <p className="card notice" role="status">Your privacy choices are saved.</p>}
    {saved === "failed" && <p className="card notice" role="alert">Your choices couldn&apos;t be saved. Please try again.</p>}
    <form action={updatePrivacy} className="card li-section privacy-form">
      <h2>Visibility</h2>
      {settings.has_profile ? <>
        <label className="confirmation"><input type="checkbox" name="show_in_directory" defaultChecked={settings.show_in_directory} /> List me in the Network directory and in &ldquo;People you may know&rdquo;</label>
        <fieldset><legend>Who can see my full profile</legend>
          <label className="confirmation"><input type="radio" name="profile_visibility" value="members" defaultChecked={settings.profile_visibility === "members"} /> All verified alumni</label>
          <label className="confirmation"><input type="radio" name="profile_visibility" value="connections" defaultChecked={settings.profile_visibility === "connections"} /> Only my connections (others see my name, headline and photo)</label>
        </fieldset>
        <p className="small muted">Appearing in mentor search is controlled by <Link className="text-link" href="/profile/edit/mentorship">your mentorship settings</Link> (currently {settings.mentor_matching ? "on" : "off"}).</p>
      </> : <><input type="hidden" name="show_in_directory" value="on" /><p className="muted">Create your profile to choose who can see it.</p></>}
      <h2>Email</h2>
      <label className="confirmation"><input type="checkbox" name="weekly_digest" defaultChecked={settings.weekly_digest} /> Send me a weekly digest of invitations, messages, sessions and new recaps</label>
      <label className="confirmation"><input type="checkbox" name="session_emails" defaultChecked={settings.session_emails} /> Email me when a mentoring session is booked, cancelled or about to start</label>
      <div className="actions"><button>Save privacy choices</button></div>
    </form>
    <section className="card li-section"><h2>Your data</h2>
      <p>Download a copy of everything Lumina holds about you: your account, profile, connections, messages, mentorships, sessions, recaps and consent history.</p>
      <a className="button secondary" href="/api/account/export" download>Download my data (JSON)</a>
    </section>
    <section className="card li-section"><h2>Consent history</h2>
      {history.length ? <ul className="consent-history">{history.map((entry, index) => <li key={index}><strong>{consentLabels[entry.kind] || entry.kind}</strong>: {entry.value} <span className="small muted">· {formatDate(entry.created_at)} · policy {entry.policy_version}</span></li>)}</ul>
        : <p className="muted">No changes recorded yet. Current policy version: {PRIVACY_POLICY_VERSION}.</p>}
    </section>
    <section className="card li-section" id="delete-account"><h2>Delete your account</h2>
      {session.user.role === "admin" ? <p className="muted">Administrator accounts can&apos;t be deleted here. Ask another administrator to change your role first.</p>
        : <DeleteAccountForm needsPassword={Boolean(account?.has_password)} />}
    </section>
  </div></AppShell>;
}
