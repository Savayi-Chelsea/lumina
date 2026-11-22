import { redirect } from "next/navigation";

export default function AdminMatchingPage() {
  redirect("/admin/insights?view=matching");
}
