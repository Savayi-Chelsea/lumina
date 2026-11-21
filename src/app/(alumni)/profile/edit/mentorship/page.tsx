import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { getMentorshipSettings, ownProfileId } from "@/lib/profile-editor";
import { MentorshipSettingsForm } from "@/components/profile-editors";
import { Icon } from "@/components/icon";
import { EditNav } from "@/components/profile-edit-nav";

export const dynamic = "force-dynamic";

export default async function MentorshipSettingsPage() {
  const session = await requireSession();
  const profileId = await ownProfileId(session.user.id);
  if (!profileId) redirect("/profile/edit");
  const settings = await getMentorshipSettings(profileId);
  return <>
    <Link className="text-link back-link" href="/profile"><Icon name="arrow" className="flip" />Back to your profile</Link>
    <p className="eyebrow">Your professional story</p><h1>Mentorship</h1>
    <EditNav current="/profile/edit/mentorship" />
    <MentorshipSettingsForm settings={settings} />
  </>;
}
