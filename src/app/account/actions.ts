"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { requireSession } from "@/lib/session";
import { AccountDeletionError, deleteMyAccount, parsePrivacy, savePrivacy } from "@/lib/privacy";

export async function updatePrivacy(data: FormData) {
  const session = await requireSession();
  const saved = await savePrivacy(session.user.id, parsePrivacy(data)).then(() => true, () => false);
  revalidatePath("/account/privacy"); revalidatePath("/network");
  redirect(`/account/privacy?saved=${saved ? "1" : "failed"}`);
}

export type DeleteState = { message: string };

export async function deleteAccount(_previous: DeleteState, data: FormData): Promise<DeleteState> {
  const session = await requireSession();
  try {
    await deleteMyAccount(session.user.id, data.get("confirmation"), data.get("password"));
  } catch (error) {
    return { message: error instanceof AccountDeletionError ? error.message : "Your account couldn't be deleted. Please try again." };
  }
  await signOut({ redirectTo: "/?account=deleted" });
  return { message: "" };
}
