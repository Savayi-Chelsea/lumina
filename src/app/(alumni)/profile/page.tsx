import Link from "next/link";
import { requireSession } from "@/lib/session";
import { ownProfileView } from "@/lib/alumni-directory";
import { connectionCount, suggestions } from "@/lib/social";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { profileProgress } from "@/lib/profile-progress";
import { getProfile } from "@/lib/profiles";
import { ProfileView, PeopleList } from "@/components/profile-view";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ saved?: string; verified?: string }> }) {
  const session = await requireSession();
  const [view, raw, { saved, verified }] = await Promise.all([ownProfileView(session.user.id), getProfile(session.user.id), searchParams]);
  const community = canDiscoverMentors(session.user);
  const [connections, people] = view && community
    ? await Promise.all([connectionCount(session.user.id), suggestions(session.user.id, 4)])
    : [0, []];
  if (!view) return <section className="card"><p className="eyebrow">Your professional story</p><h1>Create your profile</h1>
    <p>Add your name, Kenya Airways chapter and where you are today.</p><Link className="button" href="/profile/edit">Start your profile</Link></section>;
  const progress = profileProgress(raw);
  const notice = <>
    {verified && <p className="card notice" role="status">Your alumni account is verified. Complete your profile so colleagues can find you.</p>}
    {saved && <p className="card notice" role="status">Profile saved.</p>}
    {!raw?.profile_completed && <section className="card li-complete"><div><h2>Complete your profile</h2><p className="muted">Add your former KQ role, department and service years to finish setting up. {progress.completed} of {progress.total} details added.</p></div><Link className="button" href="/profile/edit">Complete profile</Link></section>}
  </>;
  return <ProfileView own profile={view} connections={connections} notice={notice}
    sidebar={<>
      <section className="card li-people"><h2>Profile strength</h2><progress value={progress.completed} max={progress.total} aria-label="Profile details completed" /><p className="small muted">{progress.percentage}% complete</p></section>
      <PeopleList title="People you may know" people={people.map(person => ({ id: person.profile_id, full_name: person.full_name, headline: person.headline, image: person.image }))} />
    </>} />;
}
