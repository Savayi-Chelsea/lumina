"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { cancelRegistration, registerForEvent } from "@/lib/community";
import { uuidPattern } from "@/lib/community-input";

/** RSVP toggle. Only active verified alumni (and admins) may register. */
export async function changeRegistration(data: FormData) {
  const session = await requireSession();
  const id = data.get("event_id");
  const intent = data.get("intent");
  if (typeof id !== "string" || !uuidPattern.test(id) || (intent !== "register" && intent !== "cancel")) redirect("/events");
  if (!canDiscoverMentors(session.user)) redirect("/verify");
  let outcome;
  try {
    outcome = intent === "register" ? await registerForEvent(id, session.user.id) : await cancelRegistration(id, session.user.id);
  } catch {
    outcome = "failed";
  }
  revalidatePath("/events"); revalidatePath(`/events/${id}`); revalidatePath("/");
  redirect(`/events/${id}?rsvp=${outcome}`);
}
