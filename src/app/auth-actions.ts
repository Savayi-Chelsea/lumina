"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { isGoogleAuthConfigured } from "@/lib/auth-environment";

export async function googleSignIn() {
  if (!isGoogleAuthConfigured()) redirect("/sign-in?error=unavailable");
  try {
    await signIn("google", { redirectTo: "/onboarding" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/sign-in?error=signin");
    // Next.js uses a thrown redirect to start the OAuth flow.
    throw error;
  }
}

export async function logOut() {
  await signOut({ redirectTo: "/" });
}
