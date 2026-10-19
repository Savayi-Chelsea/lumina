"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { applicationOrigin } from "@/lib/application-origin";
import { isValidEmail, normalizeEmail, passwordProblem } from "@/lib/credentials-input";
import { isEmailConfigured, sendMail } from "@/lib/mailer";
import { consumeResetToken, issueResetToken, resetEmail } from "@/lib/password-reset";
import { hashPassword } from "@/lib/passwords";
import { resetRequestThrottle, signInThrottle } from "@/lib/sign-in-throttle";

export type ResetState = { message: string; sent?: boolean };

const GENERIC = "If a Lumina password account uses that email, we've sent a link to reset the password. It expires in 30 minutes.";

/**
 * Always returns the same response. Token creation and delivery run after the
 * response so neither the message nor its timing reveals whether an account exists.
 */
export async function requestPasswordReset(_previous: ResetState, data: FormData): Promise<ResetState> {
  if (!isEmailConfigured()) return { message: "Password reset is not available right now." };
  const email = normalizeEmail(data.get("email"));
  if (!isValidEmail(email)) return { message: "Enter a valid email address." };
  const throttle = resetRequestThrottle();
  if (throttle.isLimited(email)) return { message: GENERIC, sent: true };
  throttle.recordFailure(email);
  after(async () => {
    try {
      const token = await issueResetToken(email);
      if (!token) return;
      const message = resetEmail(`${applicationOrigin()}/reset-password#token=${token}`);
      await sendMail({ to: email, ...message });
    } catch (error) {
      console.error("Password reset email unavailable", error instanceof Error ? error.name : "UnknownError");
    }
  });
  return { message: GENERIC, sent: true };
}

export async function completePasswordReset(_previous: ResetState, data: FormData): Promise<ResetState> {
  const token = data.get("token");
  const password = data.get("password");
  const confirm = data.get("confirm_password");
  if (typeof token !== "string" || !token) return { message: "This reset link is incomplete. Open the link from your email again." };
  if (typeof password !== "string") return { message: "Enter a new password." };
  const problem = passwordProblem(password);
  if (problem) return { message: problem };
  if (password !== confirm) return { message: "Passwords do not match." };
  let email: string | null;
  try {
    email = await consumeResetToken(token, await hashPassword(password));
  } catch (error) {
    console.error("Password reset unavailable", error instanceof Error ? error.name : "UnknownError");
    return { message: "We couldn't update your password right now. Please try again shortly." };
  }
  if (!email) return { message: "This reset link is invalid, already used or expired. Request a new one." };
  signInThrottle().reset(email);
  redirect("/sign-in?reset=1");
}
