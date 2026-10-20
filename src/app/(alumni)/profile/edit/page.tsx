import Link from "next/link";
import { requireSession } from "@/lib/session";
import { getProfile } from "@/lib/profiles";
import { ProfileForm } from "@/components/profile-form";
import { Icon } from "@/components/icon";
import { EditNav } from "@/components/profile-edit-nav";

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const session = await requireSession();
  const profile = await getProfile(session.user.id);
  return <>
    <Link className="text-link back-link" href="/profile"><Icon name="arrow" className="flip" />Back to your profile</Link>
    <p className="eyebrow">Your professional story</p><h1>Edit your profile</h1>
    <EditNav current="/profile/edit" />
    <ProfileForm profile={profile} name={session.user.name} />
  </>;
}
