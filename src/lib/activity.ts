import "server-only";
import type { Session } from "next-auth";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { activityCounts } from "@/lib/notifications";

/** Header badges for members who can use social features; never blocks a page. */
export async function headerCounts(user: Session["user"]) {
  if (!canDiscoverMentors(user)) return null;
  return activityCounts(user.id).catch(() => null);
}
