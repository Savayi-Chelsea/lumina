import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/password-reset-forms";
import { isEmailConfigured } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const available = isEmailConfigured();
  return <AuthShell>
    <AuthHeading eyebrow="ACCOUNT HELP" title={<>Forgot your <em>password?</em></>}>{available ? "Enter the email you use for Lumina and we'll send you a link to choose a new password." : undefined}</AuthHeading>
    {available ? <ForgotPasswordForm /> : <div className="auth-notice-card">
      <h2>Password reset is not available yet</h2>
      <p>Lumina cannot send password reset emails at the moment. If you signed up with Google, you can continue with Google instead.</p>
      <p>For help with a password account, contact the Lumina team.</p>
    </div>}
    <p className="auth-switch">Remembered it? <Link className="text-link" href="/sign-in">Back to sign in</Link></p>
  </AuthShell>;
}
