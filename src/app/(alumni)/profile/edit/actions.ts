"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import {
  ProfileInputError, addSkill, deleteExperience, ownProfileId, parseExperience, parseMentorshipSettings, parseSkill,
  removePhoto, removeSkill, saveExperience, saveMentorshipSettings, savePhoto, PHOTO_MAX_BYTES,
} from "@/lib/profile-editor";

export type EditState = { message: string; ok?: boolean };

/** Every editor works only on the signed-in member's own profile. */
async function profileId() {
  const session = await requireSession();
  const id = await ownProfileId(session.user.id);
  if (!id) redirect("/profile/edit");
  return id;
}
const field = (data: FormData, name: string) => { const value = data.get(name); return typeof value === "string" ? value : ""; };
function refresh() { revalidatePath("/profile"); revalidatePath("/network"); revalidatePath("/"); }
const failure = (error: unknown, fallback: string): EditState => ({ message: error instanceof ProfileInputError ? error.message : fallback });

export async function saveExperienceAction(_previous: EditState, data: FormData): Promise<EditState> {
  const id = await profileId();
  try {
    const saved = await saveExperience(id, parseExperience(data), field(data, "entry_id") || undefined);
    if (!saved) return { message: "That entry no longer exists." };
  } catch (error) { return failure(error, "Your experience could not be saved."); }
  refresh();
  redirect("/profile/edit/experience?saved=1");
}

export async function deleteExperienceAction(data: FormData) {
  const id = await profileId();
  await deleteExperience(id, field(data, "entry_id")).catch(() => false);
  refresh();
  redirect("/profile/edit/experience");
}

export async function addSkillAction(_previous: EditState, data: FormData): Promise<EditState> {
  const id = await profileId();
  let outcome;
  try { outcome = await addSkill(id, parseSkill(data)); } catch (error) { return failure(error, "That skill could not be added."); }
  refresh();
  if (outcome === "limit") return { message: "You can list up to 30 skills. Remove one to add another." };
  if (outcome === "exists") return { message: "That skill is already on your profile." };
  return { message: "Skill added.", ok: true };
}

export async function removeSkillAction(data: FormData) {
  const id = await profileId();
  await removeSkill(id, field(data, "skill_id")).catch(() => false);
  refresh();
  redirect("/profile/edit/skills");
}

export async function saveMentorshipAction(_previous: EditState, data: FormData): Promise<EditState> {
  const id = await profileId();
  try { await saveMentorshipSettings(id, parseMentorshipSettings(data)); } catch (error) { return failure(error, "Your mentorship settings could not be saved."); }
  refresh(); revalidatePath("/mentorship");
  return { message: "Mentorship settings saved. Mentor search updates within a minute.", ok: true };
}

export async function uploadPhotoAction(_previous: EditState, data: FormData): Promise<EditState> {
  const id = await profileId();
  const file = data.get("photo");
  if (!(file instanceof File) || !file.size) return { message: "Choose a photo to upload." };
  if (file.size > PHOTO_MAX_BYTES) return { message: "Photos must be smaller than 512 KB." };
  try { await savePhoto(id, new Uint8Array(await file.arrayBuffer())); } catch (error) { return failure(error, "Your photo could not be saved."); }
  refresh();
  return { message: "Photo updated.", ok: true };
}

export async function removePhotoAction() {
  const id = await profileId();
  await removePhoto(id).catch(() => undefined);
  refresh();
  redirect("/profile/edit/photo");
}
