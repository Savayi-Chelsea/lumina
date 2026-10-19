import Link from "next/link";
import { AuthHeading, AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/password-reset-forms";

export default function ResetPasswordPage() {
  return <AuthShell>
    <AuthHeading eyebrow="ACCOUNT HELP" title={<>Choose a new <em>password.</em></>}>Your new password replaces the old one straight away.</AuthHeading>
    <ResetPasswordForm />
    <p className="auth-switch"><Link className="text-link" href="/sign-in">Back to sign in</Link></p>
  </AuthShell>;
}
