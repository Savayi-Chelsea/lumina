import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";

// No email provider is configured, so nothing is sent and nothing claims to be.
export default function ForgotPasswordPage() {
  return <AuthShell>
    <AuthHeading eyebrow="ACCOUNT HELP" title={<>Forgot your <em>password?</em></>} />
    <div className="auth-notice-card">
      <h2>Password reset is not available yet</h2>
      <p>Lumina cannot send password reset emails at the moment. If you signed up with Google, you can continue with Google instead.</p>
      <p>For help with a password account, contact the Lumina team.</p>
    </div>
    <div className="actions"><Link className="button" href="/sign-in">Back to sign in</Link><Link className="button secondary" href="/sign-up">Create an account</Link></div>
  </AuthShell>;
}
