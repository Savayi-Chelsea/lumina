"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { isAuthConfigured, isGoogleAuthConfigured } from "@/lib/auth-environment";
import { normalizeEmail, parseRegistration } from "@/lib/credentials-input";
import { createPasswordUser } from "@/lib/lumina-users";
import { hashPassword } from "@/lib/passwords";
import { signInThrottle } from "@/lib/sign-in-throttle";

export type AuthFormState = { message: string };

const UNAVAILABLE = "Sign-in is temporarily unavailable. Please try again shortly.";
const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

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

export async function passwordSignIn(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured()) return { message: UNAVAILABLE };
  const email = field(data, "email");
  try {
    // Pass only the two credentials; never forward the raw form or log either value.
    await signIn("credentials", { email, password: field(data, "password"), redirectTo: "/onboarding" });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type !== "CredentialsSignin") return { message: UNAVAILABLE };
      return { message: signInThrottle().isLimited(normalizeEmail(email))
        ? "Too many sign-in attempts. Please wait 15 minutes and try again."
        : "Email or password is incorrect." };
    }
    throw error;
  }
  return { message: "" };
}

export async function registerAccount(_previous: AuthFormState, data: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured()) return { message: "Account creation is temporarily unavailable. Please try again shortly." };
  const parsed = parseRegistration(data);
  if (!parsed.ok) return { message: parsed.message };
  const { fullName, email, password } = parsed.value;
  let outcome;
  try {
    outcome = await createPasswordUser(fullName, email, await hashPassword(password));
  } catch (error) {
    console.error("Lumina registration unavailable", error instanceof Error ? error.name : "UnknownError");
    return { message: "We could not create your account right now. Please try again shortly." };
  }
  if (outcome === "duplicate") return { message: "An account with this email already exists. Sign in instead." };
  try {
    await signIn("credentials", { email, password, redirectTo: "/onboarding" });
  } catch (error) {
    // The account exists; let the person sign in manually rather than retrying creation.
    if (error instanceof AuthError) redirect("/sign-in?registered=1");
    throw error;
  }
  return { message: "" };
}

export async function logOut() {
  await signOut({ redirectTo: "/" });
}
