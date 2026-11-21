"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { setRecapHidden } from "@/lib/session-recaps";

export async function moderateRecap(data: FormData) {
  const session = await requireAdmin();
  const id = data.get("recap_id");
  const action = data.get("action");
  const page = data.get("page");
  const target = typeof page === "string" && /^\d{1,4}$/.test(page) && page !== "1" ? `/admin/recaps?page=${page}` : "/admin/recaps";
  let changed = false;
  if (typeof id === "string" && (action === "hide" || action === "restore")) {
    changed = await setRecapHidden(session.user.id, id, action === "hide").catch(() => false);
  }
  revalidatePath("/admin/recaps"); revalidatePath("/recaps"); revalidatePath("/");
  redirect(`${target}${target.includes("?") ? "&" : "?"}result=${changed ? action : "unchanged"}`);
}
