import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";

/**
 * Append-only record of administrative and account actions. The table refuses
 * updates and deletes (see migration 008), so entries cannot be altered later.
 * Details hold identifiers and outcomes only, never message text or passwords.
 */
export const AUDIT_ACTIONS = {
  "user.suspend": "Suspended an account",
  "user.reinstate": "Reinstated an account",
  "verification.verified": "Verified a member from an exception",
  "verification.closed_unresolved": "Closed a verification exception",
  "event.create": "Created an event",
  "event.update": "Updated an event",
  "event.status": "Changed an event's status",
  "opportunity.create": "Created an opportunity",
  "opportunity.update": "Updated an opportunity",
  "opportunity.status": "Changed an opportunity's status",
  "recap.hide": "Hid a session recap",
  "recap.restore": "Restored a session recap",
  "account.delete": "Deleted their own account",
  "account.export": "Downloaded their data",
} as const;
export type AuditAction = keyof typeof AUDIT_ACTIONS;

/** SQL fragment that appends one audit row; use inside a CTE or a transaction. */
export const AUDIT_INSERT = "INSERT INTO audit_log (actor_id, action, target_type, target_id, details)";

export async function recordAudit(db: Pick<PoolClient, "query">, actorId: string | null, action: AuditAction, targetType: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await db.query(`${AUDIT_INSERT} VALUES ($1, $2, $3, $4, $5)`, [actorId, action, targetType, targetId, JSON.stringify(details)]);
}

export type AuditEntry = { id: string; action: AuditAction; target_type: string; target_id: string | null; details: Record<string, unknown>; created_at: string; actor_name: string | null; actor_email: string | null };
export const AUDIT_PAGE_SIZE = 30;

export async function listAudit(filters: { action: string | null; page: number }) {
  const action = filters.action && filters.action in AUDIT_ACTIONS ? filters.action : null;
  const where = action ? "WHERE a.action = $1" : "WHERE $1::text IS NULL";
  const total = (await database().query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log a ${where}`, [action])).rows[0].n;
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pages);
  const rows = (await database().query<AuditEntry>(`SELECT a.id::text, a.action, a.target_type, a.target_id, a.details, a.created_at,
      p.full_name AS actor_name, u.email AS actor_email
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id LEFT JOIN profiles p ON p.user_id = u.id
    ${where} ORDER BY a.created_at DESC, a.id DESC LIMIT $2 OFFSET $3`, [action, AUDIT_PAGE_SIZE, (page - 1) * AUDIT_PAGE_SIZE])).rows;
  return { entries: rows, total, page, pages, action };
}
