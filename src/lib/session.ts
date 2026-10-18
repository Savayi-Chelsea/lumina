import "server-only";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/auth-environment";

export async function currentSession() {
  if (!isAuthConfigured()) return null;
  return auth();
}

export async function requireSession() {
  const session = await currentSession();
  if (!session?.user) redirect("/sign-in");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/account?access=denied");
  return session;
}
