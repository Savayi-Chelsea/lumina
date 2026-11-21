import Link from "next/link";
import { requireSession } from "@/lib/session";
import { ownProfileView } from "@/lib/alumni-directory";
import { PhotoForm } from "@/components/profile-editors";
import { AlumniAvatar } from "@/components/alumni-avatar";
import { Icon } from "@/components/icon";
import { EditNav } from "@/components/profile-edit-nav";
import { removePhotoAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PhotoPage() {
  const session = await requireSession();
  const profile = await ownProfileView(session.user.id);
  const uploaded = Boolean(profile?.image?.startsWith("/api/profile-photo/"));
  return <>
    <Link className="text-link back-link" href="/profile"><Icon name="arrow" className="flip" />Back to your profile</Link>
    <p className="eyebrow">Your professional story</p><h1>Profile photo</h1>
    <EditNav current="/profile/edit/photo" />
    <section className="card li-section photo-current"><AlumniAvatar name={profile?.full_name || session.user.name || "Member"} image={profile?.image} large />
      <div><h2>Current photo</h2><p className="muted">{uploaded ? "Your uploaded photo." : profile?.image ? "Your Google profile picture." : "Your initials are shown until you add a photo."}</p>
        {uploaded && <form action={removePhotoAction}><button className="secondary">Remove photo</button></form>}</div></section>
    <PhotoForm />
  </>;
}
