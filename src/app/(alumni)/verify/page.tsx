import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getAssistanceStatus } from "@/lib/verification";
import { AssistanceForm, VerificationForm } from "@/components/verification-form";

export default async function VerifyPage() {
  const session = await requireSession();
  if (session.user.role === "admin") redirect("/admin");
  if (session.user.alumniVerified && session.user.accountStatus === "active") redirect("/profile");
  const assistance = await getAssistanceStatus();
  return <>
    <p className="eyebrow">Your alumni verification</p>
    <h1>One more step to verify your journey</h1>
    <p>You&apos;re signed in. Confirm your Kenya Airways service details, then complete your professional profile.</p>
    <section className="card notice"><h2>Why we verify</h2>
      <p>Lumina is for former Kenya Airways colleagues. Your details are checked against the alumni registry and are never shown on your profile.</p>
      <p>Verification details stay separate from your public profile. Changing your profile does not change the registry.</p>
    </section>
    {assistance?.resolution_outcome === "closed_unresolved" && <p className="card notice" role="status">Your assistance request was closed unresolved. Your account is still available. You can correct your details, retry, or request assistance again.</p>}
    <VerificationForm />
    <div className="grid"><AssistanceForm open={Boolean(assistance && !assistance.resolution_outcome)} /></div>
  </>;
}
