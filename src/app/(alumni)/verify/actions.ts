"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { parseVerification } from "@/lib/verification-input";
import { requestAssistance, verifyAlumni } from "@/lib/verification";

export type VerificationState = { message: string };

export async function submitVerification(_previous: VerificationState, data: FormData): Promise<VerificationState> {
  await requireSession();
  let details;
  try {
    details = parseVerification(data);
  } catch (error) {
    return { message: error instanceof Error ? error.message : "Please check your details." };
  }
  let outcome;
  try {
    outcome = await verifyAlumni(details);
  } catch {
    return { message: "Verification is temporarily unavailable. Your account is unchanged. Please try again shortly or request assistance." };
  }
  if (outcome !== "verified") return {
    message: "We could not resolve your verification with those details. Please check them and try again, or request assistance. Your account remains available and has not been suspended.",
  };
  revalidatePath("/");
  revalidatePath("/verify");
  revalidatePath("/admin");
  revalidatePath("/admin/verification");
  redirect("/profile?verified=1");
}

export async function submitAssistance(_previous: VerificationState): Promise<VerificationState> {
  void _previous;
  await requireSession();
  let requested;
  try {
    requested = await requestAssistance();
  } catch {
    return { message: "Your request could not be saved. Please try again shortly." };
  }
  revalidatePath("/verify");
  revalidatePath("/admin");
  revalidatePath("/admin/verification");
  return { message: requested
    ? "Assistance requested. An administrator will review your exception. You can still correct your details and retry verification."
    : "No request was created. Your account may already be verified; refresh to check your status." };
}
