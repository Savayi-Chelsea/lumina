import { redirect } from "next/navigation";

// Opportunities shows the Kenya job feed only; admin-posted community listings are
// no longer listed to members. Search filters carry over (q, topic, mode).
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "topic", "mode"]) {
    const value = query[key];
    if (typeof value === "string" && value) params.set(key, value);
  }
  redirect(`/opportunities/jobs${params.size ? `?${params}` : ""}`);
}
