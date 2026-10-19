import Link from "next/link";
import type { Publication } from "@/lib/community-input";
import { changePublication } from "@/app/admin/community-actions";

const labels: Record<Publication, string> = { draft: "Draft", published: "Published", archived: "Archived" };

export function StatusBadge({ status }: { status: Publication }) {
  return <span className={`badge status-${status}`}>{labels[status]}</span>;
}

/** Publish, unpublish, archive and restore without opening the editor. */
export function PublicationControls({ kind, id, status, edit = true }: { kind: "events" | "opportunities"; id: string; status: Publication; edit?: boolean }) {
  const next: [Publication, string][] = status === "published" ? [["draft", "Unpublish"], ["archived", "Archive"]]
    : status === "draft" ? [["published", "Publish"], ["archived", "Archive"]] : [["draft", "Restore as draft"]];
  return <div className="actions">
    {edit && <Link className="button secondary" href={`/admin/${kind}/${id}`}>Edit</Link>}
    {next.map(([target, label]) => <form key={target} action={changePublication}>
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
      <button className={target === "published" ? "" : "secondary"} name="status" value={target}>{label}</button>
    </form>)}
  </div>;
}

export function AdminNotice({ saved, status }: { saved?: string; status?: string }) {
  const message = saved ? "Saved." : status === "failed" ? "That change could not be made. Refresh and try again."
    : status === "published" ? "Published. It is now visible to verified alumni." : status === "draft" ? "Moved to drafts. It is hidden from alumni."
    : status === "archived" ? "Archived. It is hidden from alumni and kept for your records." : null;
  return message ? <p className="card notice" role="status">{message}</p> : null;
}
