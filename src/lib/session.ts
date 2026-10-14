import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isGoogleAuthConfigured } from "@/lib/auth-environment";

export async function currentSession() {
  if (!isGoogleAuthConfigured()) return null;
  return auth();
}

export async function requireSession() {
  const session = await currentSession();
  if (!session?.user) redirect("/sign-in");
  return session;
}
