import { requireSession } from "@/lib/session";
import { getProfile } from "@/lib/profiles";
import { ProfileForm } from "@/components/profile-form";
export default async function ProfilePage() {
 const session = await requireSession();
 const profile = await getProfile(session.user.id);
 return <><p className="eyebrow">Your professional story</p><h1>Your story, in your words.</h1><p className="muted">The roles that shaped you. The work you do today. Let people discover the experience you bring.</p>{session.user.alumniVerified && session.user.accountStatus === "active" && <p className="card notice" role="status">Your alumni account is verified. {profile?.profile_completed ? "Keep your professional story up to date as your journey unfolds." : "Complete your professional profile to continue your Lumina journey."}</p>}<ProfileForm profile={profile} name={session.user.name} /></>;
}
