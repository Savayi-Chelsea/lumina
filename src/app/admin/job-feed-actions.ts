"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { refreshJobFeed } from "@/lib/job-feed";
import { recordAudit } from "@/lib/audit";
import { database } from "@/lib/db";

/**
 * Fetch every enabled job source now, ignoring the daily schedule. The refresh runs
 * after the response (it makes about two dozen polite requests and can take half a
 * minute), so the administrator is never left waiting; the outcome is audited when
 * it finishes and the source status on the page shows the result.
 */
export async function refreshJobsNow() {
  const session = await requireAdmin();
  after(async () => {
    let outcome = "failed";
    let runs: { source: string; status: string; seen: number; added: number; removed: number }[] = [];
    try {
      const result = await refreshJobFeed({ force: true });
      runs = result.runs.map(run => ({ source: run.source, status: run.status, seen: run.seen, added: run.added, removed: run.removed }));
      outcome = result.busy ? "busy" : !result.runs.length ? "off"
        : result.runs.every(run => run.status === "succeeded" && !run.error) ? "refreshed"
        : result.runs.some(run => run.status === "succeeded") ? "partial" : "failed";
    } catch (error) {
      console.error("Job feed refresh failed", error instanceof Error ? error.name : "UnknownError");
    }
    await recordAudit(database(), session.user.id, "jobs.refresh", "job_feed", null, { outcome, runs }).catch(() => {});
  });
  redirect("/admin/opportunities?jobs=started");
}
