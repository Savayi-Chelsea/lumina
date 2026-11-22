import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { isAuthConfigured } from "@/lib/auth-environment";

export async function currentSession() {
  // Wait for a real request before reading AUTH_SECRET. Without this, a build
  // without the secret (such as the Docker image) prerenders signed-in pages as
  // a permanent redirect to /sign-in.
  await connection();
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
