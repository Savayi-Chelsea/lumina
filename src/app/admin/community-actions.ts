"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { saveEvent, saveOpportunity, setStatus } from "@/lib/community";
import { CommunityInputError, PUBLICATION, parseEvent, parseOpportunity, publicationIntent, uuidPattern, type Publication } from "@/lib/community-input";

export type ManageState = { message: string };

const existingId = (data: FormData) => {
  const id = data.get("id");
  return typeof id === "string" && uuidPattern.test(id) ? id : undefined;
};
function refresh(kind: "events" | "opportunities") {
  revalidatePath(`/${kind}`); revalidatePath(`/admin/${kind}`); revalidatePath("/"); revalidatePath("/admin");
}

export async function manageEvent(_previous: ManageState, data: FormData): Promise<ManageState> {
  const session = await requireAdmin();
  let id: string | null;
  try {
    id = await saveEvent(parseEvent(data), publicationIntent(data), session.user.id, existingId(data));
  } catch (error) {
    if (error instanceof CommunityInputError) return { message: error.message };
    console.error("Event could not be saved", error instanceof Error ? error.name : "UnknownError");
    return { message: "The event could not be saved. Please try again." };
  }
  if (!id) return { message: "This event no longer exists." };
  refresh("events");
  redirect(`/admin/events?saved=${id}`);
}

export async function manageOpportunity(_previous: ManageState, data: FormData): Promise<ManageState> {
  const session = await requireAdmin();
  let id: string | null;
  try {
    id = await saveOpportunity(parseOpportunity(data), publicationIntent(data), session.user.id, existingId(data));
  } catch (error) {
    if (error instanceof CommunityInputError) return { message: error.message };
    console.error("Opportunity could not be saved", error instanceof Error ? error.name : "UnknownError");
    return { message: "The opportunity could not be saved. Please try again." };
  }
  if (!id) return { message: "This opportunity no longer exists." };
  refresh("opportunities");
  redirect(`/admin/opportunities?saved=${id}`);
}

export async function changePublication(data: FormData) {
  await requireAdmin();
  const kind = data.get("kind") === "opportunities" ? "opportunities" : "events";
  const id = data.get("id");
  const status = data.get("status");
  const valid = typeof id === "string" && (PUBLICATION as readonly unknown[]).includes(status);
  const changed = valid ? await setStatus(kind, id as string, status as Publication).catch(() => false) : false;
  refresh(kind);
  redirect(`/admin/${kind}?${changed ? `status=${status}` : "status=failed"}`);
}
