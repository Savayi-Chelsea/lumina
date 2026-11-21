import Link from "next/link";
import { recommendMentors } from "@/lib/mentor-recommendations";
import { MentorCard } from "./mentor-card";
import { Icon } from "./icon";

/** Streams in after Home renders; shows nothing if there are no confident recommendations. */
export async function MentorsForYou({ userId }: { userId: string }) {
  const { mentors, searchId } = await recommendMentors(userId);
  if (!mentors.length) return null;
  return <section className="discovery-section" aria-labelledby="for-you-heading">
    <div className="section-heading"><div><p className="eyebrow">CHOSEN FROM YOUR PROFILE</p><h2 id="for-you-heading">Mentors for you</h2></div>
      <Link className="text-link" href="/mentorship">Search for something specific<Icon name="arrow" /></Link></div>
    <p className="section-description">Alumni mentors whose experience is closest to yours, found by Lumina&apos;s language model from your profile. Keep your profile up to date for better suggestions.</p>
    <div className="mentor-results-grid">{mentors.map((mentor, index) => <MentorCard key={mentor.profileId} mentor={mentor} rank={index + 1} searchId={searchId} />)}</div>
  </section>;
}
