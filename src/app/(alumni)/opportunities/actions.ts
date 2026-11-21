"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { APPLICATION_NOTE_MAX, applyToOpportunity, withdrawApplication, type ApplicationOutcome } from "@/lib/community";
import { uuidPattern } from "@/lib/community-input";

/** Apply through Lumina, or withdraw. Only active verified alumni (and admins) may apply. */
export async function changeApplication(data: FormData) {
  const session = await requireSession();
  const id = data.get("opportunity_id");
  const intent = data.get("intent");
  if (typeof id !== "string" || !uuidPattern.test(id) || (intent !== "apply" && intent !== "withdraw")) redirect("/opportunities");
  if (!canDiscoverMentors(session.user)) redirect("/verify");
  const raw = data.get("note");
  const note = typeof raw === "string" ? raw.normalize("NFC").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() : "";
  if (note.length > APPLICATION_NOTE_MAX) redirect(`/opportunities/${id}?application=too_long`);
  let outcome: ApplicationOutcome | "failed";
  try {
    outcome = intent === "apply" ? await applyToOpportunity(id, session.user.id, note || null) : await withdrawApplication(id, session.user.id);
  } catch {
    outcome = "failed";
  }
  revalidatePath("/opportunities"); revalidatePath(`/opportunities/${id}`); revalidatePath("/admin/opportunities");
  redirect(`/opportunities/${id}?application=${outcome}`);
}
