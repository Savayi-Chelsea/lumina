import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getProfile } from "@/lib/profiles";

export default async function OnboardingPage() {
  const session = await requireSession();
  if (session.user.role === "admin") redirect("/admin");
  if (!session.user.alumniVerified || session.user.accountStatus === "pending") redirect("/verify");
  const profile = await getProfile(session.user.id);
  redirect(profile?.profile_completed ? "/" : "/profile");
}
