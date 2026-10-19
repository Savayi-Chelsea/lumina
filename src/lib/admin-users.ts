import "server-only";
import { database } from "@/lib/db";
import { uuidPattern } from "@/lib/community-input";

export const USERS_PAGE_SIZE = 25;
const STATUSES = ["active", "pending", "suspended"] as const;

export type AdminUser = {
  id: string; email: string; full_name: string | null; role: "alumni" | "admin";
  account_status: (typeof STATUSES)[number]; alumni_verified: boolean;
  sign_in: "Google" | "Password" | "Sample"; created_at: string;
};

export function parseUserFilters(params: Record<string, string | string[] | undefined>) {
  const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
  const status = one(params.status);
  const page = Number(one(params.page));
  return {
    q: one(params.q).normalize("NFC").trim().slice(0, 100).replace(/\p{C}/gu, ""),
    status: (STATUSES as readonly string[]).includes(status) ? status as AdminUser["account_status"] : null,
    page: Number.isInteger(page) && page > 0 && page < 100000 ? page : 1,
  };
}

/** Administration view. Never selects password hashes or Google subjects themselves. */
export async function listUsers(filters: ReturnType<typeof parseUserFilters>) {
  const values: unknown[] = [];
  const conditions = ["TRUE"];
  if (filters.q) {
    values.push(`%${filters.q.replace(/[\\%_]/g, value => `\\${value}`)}%`);
    conditions.push(`(u.email ILIKE $${values.length} OR p.full_name ILIKE $${values.length})`);
  }
  if (filters.status) { values.push(filters.status); conditions.push(`u.account_status = $${values.length}`); }
  const where = conditions.join(" AND ");
  const from = "FROM users u LEFT JOIN profiles p ON p.user_id = u.id";
  const total = Number((await database().query<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where}`, values)).rows[0].n);
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  values.push(USERS_PAGE_SIZE, (page - 1) * USERS_PAGE_SIZE);
  const users = (await database().query<AdminUser>(`SELECT u.id, u.email, p.full_name, u.role, u.account_status, u.alumni_verified, u.created_at,
      CASE WHEN u.google_subject IS NOT NULL THEN 'Google' WHEN u.password_hash LIKE '$argon2id$%' THEN 'Password' ELSE 'Sample' END AS sign_in
    ${from} WHERE ${where} ORDER BY (u.email LIKE '%@synthetic.lumina.local'), u.created_at DESC, u.id
    LIMIT $${values.length - 1} OFFSET $${values.length}`, values)).rows;
  const summary = (await database().query<{ active: number; pending: number; suspended: number; verified: number }>(`SELECT
    count(*) FILTER (WHERE account_status = 'active')::int AS active, count(*) FILTER (WHERE account_status = 'pending')::int AS pending,
    count(*) FILTER (WHERE account_status = 'suspended')::int AS suspended, count(*) FILTER (WHERE alumni_verified)::int AS verified FROM users`)).rows[0];
  return { users, total, page, pages, summary };
}

/**
 * Suspends or reinstates an alumni account. Administrators cannot change their own
 * account or other administrators here. Reinstated accounts return to active only
 * if already verified; otherwise they go back to pending verification.
 */
export async function setAccountStatus(adminId: string, userId: string, action: "suspend" | "reinstate") {
  if (!uuidPattern.test(userId) || userId === adminId) return false;
  const status = action === "suspend" ? "'suspended'" : "CASE WHEN alumni_verified THEN 'active' ELSE 'pending' END";
  const guard = action === "suspend" ? "account_status <> 'suspended'" : "account_status = 'suspended'";
  const result = await database().query(`UPDATE users SET account_status = ${status}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $1 AND role = 'alumni' AND ${guard}`, [userId]);
  return Boolean(result.rowCount);
}
