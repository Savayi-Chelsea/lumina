import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { requireAdmin, requireSession } from "@/lib/session";
import { normalizedText, staffNumber, type VerificationDetails } from "@/lib/verification-input";
import type { LuminaUser } from "@/lib/lumina-users";

type Account = LuminaUser & { google_subject: string | null; has_password: boolean };
type RegistryRecord = {
  id: string;
  surname: string;
  former_kq_department: string;
  kq_start_year: number;
  kq_end_year: number;
  claimed_by_user_id: string | null;
};
export type AssistanceRequest = {
  id: string;
  email: string;
  full_name: string | null;
  requested_at: Date;
  account_status: string;
};
export type AssistanceStatus = {
  resolution_outcome: "verified" | "closed_unresolved" | null;
  requested_at: Date;
};

async function transaction<T>(work: (conn: PoolClient) => Promise<T>) {
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const result = await work(conn);
    await conn.query("COMMIT");
    return result;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

async function lockedUser(conn: PoolClient, id: string) {
  return (await conn.query<Account>(
    `SELECT id, role, account_status, alumni_verified, google_subject,
       (password_hash LIKE '$argon2id$%') AS has_password FROM users WHERE id = $1 FOR UPDATE`, [id],
  )).rows[0];
}

function eligible(user: Account | undefined) {
  // A real sign-in identity (Google or an Argon2id password) is required; seeded
  // non-login fixtures have neither and can never claim registry records.
  return user?.role === "alumni" && user.account_status !== "suspended" && (Boolean(user.google_subject) || user.has_password === true);
}

async function lockedRecord(conn: PoolClient, number: string) {
  return (await conn.query<RegistryRecord>(
    `SELECT id, surname, former_kq_department, kq_start_year, kq_end_year, claimed_by_user_id
     FROM alumni_registry WHERE synthetic_staff_number = $1 FOR UPDATE`, [number],
  )).rows[0];
}

async function claim(conn: PoolClient, record: RegistryRecord, userId: string) {
  if (record.claimed_by_user_id && record.claimed_by_user_id !== userId) return false;
  const other = await conn.query(
    "SELECT id FROM alumni_registry WHERE claimed_by_user_id = $1 AND id <> $2", [userId, record.id],
  );
  if (other.rows.length) return false;
  const updated = await conn.query(
    `UPDATE alumni_registry SET claimed_by_user_id = $2, claimed_at = COALESCE(claimed_at, CURRENT_TIMESTAMP)
     WHERE id = $1 AND (claimed_by_user_id IS NULL OR claimed_by_user_id = $2) RETURNING id`,
    [record.id, userId],
  );
  if (!updated.rows.length) return false;
  await conn.query(
    "UPDATE users SET account_status = 'active', alumni_verified = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [userId],
  );
  return true;
}

async function resolveRequest(conn: PoolClient, userId: string, resolverId: string, outcome: string) {
  await conn.query(
    `UPDATE verification_assistance_requests
     SET resolved_at = CURRENT_TIMESTAMP, resolved_by_user_id = $2, resolution_outcome = $3
     WHERE user_id = $1 AND resolved_at IS NULL`, [userId, resolverId, outcome],
  );
}

export async function verifyAlumni(details: VerificationDetails): Promise<"verified" | "unresolved"> {
  const session = await requireSession();
  const number = staffNumber(details.staffNumber);
  return transaction(async conn => {
    // User locks serialize attempts on different records for the same account.
    const user = await lockedUser(conn, session.user.id);
    if (!eligible(user)) return "unresolved";
    if (user.alumni_verified && user.account_status === "active") return "verified";
    const record = await lockedRecord(conn, number);
    if (!record || normalizedText(record.surname) !== normalizedText(details.surname)
      || normalizedText(record.former_kq_department) !== normalizedText(details.department)
      || record.kq_start_year !== details.startYear || record.kq_end_year !== details.endYear) return "unresolved";
    if (!await claim(conn, record, user.id)) return "unresolved";
    // A successful retry resolves one's own open request, without admin approval.
    await resolveRequest(conn, user.id, user.id, "verified");
    return "verified";
  });
}

export async function getAssistanceStatus(): Promise<AssistanceStatus | null> {
  const session = await requireSession();
  return (await database().query<AssistanceStatus>(
    "SELECT resolution_outcome, requested_at FROM verification_assistance_requests WHERE user_id = $1",
    [session.user.id],
  )).rows[0] || null;
}

export async function requestAssistance() {
  const session = await requireSession();
  return transaction(async conn => {
    const user = await lockedUser(conn, session.user.id);
    if (!eligible(user) || (user.alumni_verified && user.account_status === "active")) return false;
    await conn.query(
      `INSERT INTO verification_assistance_requests (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET requested_at = CURRENT_TIMESTAMP,
       resolved_at = NULL, resolved_by_user_id = NULL, resolution_outcome = NULL
       WHERE verification_assistance_requests.resolved_at IS NOT NULL`, [user.id],
    );
    return true;
  });
}

export async function pendingRequests(): Promise<AssistanceRequest[]> {
  await requireAdmin();
  return (await database().query<AssistanceRequest>(
    `SELECT u.id, u.email, u.account_status, p.full_name, r.requested_at
     FROM verification_assistance_requests r JOIN users u ON u.id = r.user_id
     LEFT JOIN profiles p ON p.user_id = u.id WHERE r.resolved_at IS NULL
     ORDER BY r.requested_at, u.id`,
  )).rows;
}

export async function resolveAssistance(userId: string, outcome: string, number?: string) {
  const session = await requireAdmin();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    || !["verified", "closed_unresolved"].includes(outcome)) throw new Error("Invalid resolution");
  const parsedNumber = outcome === "verified" ? staffNumber(number) : null;
  return transaction(async conn => {
    const actor = (await conn.query(
      "SELECT id FROM users WHERE id = $1 AND role = 'admin' AND account_status <> 'suspended' FOR SHARE",
      [session.user.id],
    )).rows[0];
    if (!actor || userId === session.user.id) throw new Error("Administrator required");
    const user = await lockedUser(conn, userId);
    const request = await conn.query(
      "SELECT user_id FROM verification_assistance_requests WHERE user_id = $1 AND resolved_at IS NULL FOR UPDATE", [userId],
    );
    if (!request.rows.length) return false;
    if (outcome === "verified") {
      if (!eligible(user)) return false;
      const record = await lockedRecord(conn, parsedNumber!);
      if (!record || !await claim(conn, record, userId)) return false;
    }
    // Closing unresolved changes only the request, never the account.
    await resolveRequest(conn, userId, session.user.id, outcome);
    return true;
  });
}
