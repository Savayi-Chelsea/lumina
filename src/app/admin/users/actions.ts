"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { setAccountStatus } from "@/lib/admin-users";

export async function changeAccountStatus(data: FormData) {
  const session = await requireAdmin();
  const id = data.get("user_id");
  const action = data.get("action");
  const back = data.get("return_to");
  const target = typeof back === "string" && /^\/admin\/users(?:\?[\w=&%.+-]*)?$/.test(back) ? back : "/admin/users";
  let changed = false;
  if (typeof id === "string" && (action === "suspend" || action === "reinstate")) {
    changed = await setAccountStatus(session.user.id, id, action).catch(() => false);
  }
  revalidatePath("/admin/users");
  redirect(`${target}${target.includes("?") ? "&" : "?"}result=${changed ? action : "unchanged"}`);
}
