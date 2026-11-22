import { redirect } from "next/navigation";

// Community listings are no longer used; the admin page is the Kenya jobs feed.
export default async function AdminOpportunitiesPage({ searchParams }: { searchParams: Promise<{ jobs?: string }> }) {
  const { jobs } = await searchParams;
  redirect(`/admin/jobs${typeof jobs === "string" && /^[a-z]+$/.test(jobs) ? `?jobs=${jobs}` : ""}`);
}
