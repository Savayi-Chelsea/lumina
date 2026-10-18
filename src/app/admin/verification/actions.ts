"use server";
import { resolveAssistance } from "@/lib/verification";
import { requireAdmin } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
export async function reviewVerification(data: FormData) {
 await requireAdmin();
 const id = data.get("user_id");
 const outcome = data.get("outcome");
 const staff = data.get("staff_number");
 if (typeof id !== "string" || typeof outcome !== "string"
   || !["verified", "closed_unresolved"].includes(outcome)
   || (outcome === "verified" && (typeof staff !== "string" || data.get("confirm_association") !== "yes"))) redirect("/admin/verification?result=invalid");
 let changed;
 try { changed = await resolveAssistance(id, outcome, typeof staff === "string" ? staff : undefined); } catch { redirect("/admin/verification?result=failed"); }
 revalidatePath("/admin"); revalidatePath("/admin/verification"); revalidatePath("/");
 revalidatePath("/verify");
 redirect(`/admin/verification?result=${changed ? outcome : "stale"}`);
}
