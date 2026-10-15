"use server";
import { requireSession } from "@/lib/session";
import { parseProfile, saveProfile } from "@/lib/profiles";
import { revalidatePath } from "next/cache";
export async function updateProfile(_previous: { message: string; ok: boolean }, data: FormData) {
 const session = await requireSession();
 let values;
 try { values = parseProfile(data); } catch(error) { return { message: error instanceof Error ? error.message : "Check your profile fields.", ok: false }; }
 try { await saveProfile(session.user.id, values); } catch { return { message: "Your profile could not be saved. Please try again.", ok: false }; }
 revalidatePath("/"); revalidatePath("/profile");
 return { message: "Profile saved. Alumni verification is handled separately through the registry check.", ok: true };
}
