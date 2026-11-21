import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { verifyPassword } from "@/lib/passwords";

/**
 * Member privacy controls under the Kenya Data Protection Act 2019: directory
 * listing, profile visibility, email choices, a consent history, a copy of
 * your data, and account deletion.
 */
export const PRIVACY_POLICY_VERSION = "2026-10";

export type PrivacySettings = {
  has_profile: boolean; show_in_directory: boolean; profile_visibility: "members" | "connections";
  weekly_digest: boolean; session_emails: boolean; mentor_matching: boolean;
};
type Queryable = Pick<PoolClient, "query">;

export async function privacySettings(userId: string): Promise<PrivacySettings> {
  const row = (await database().query<Omit<PrivacySettings, "has_profile"> & { profile_id: string | null }>(`
    SELECT p.id AS profile_id, COALESCE(p.show_in_directory, TRUE) AS show_in_directory, COALESCE(p.profile_visibility, 'members') AS profile_visibility,
      COALESCE(e.weekly_digest, FALSE) AS weekly_digest, COALESCE(e.session_emails, TRUE) AS session_emails,
      COALESCE(m.consent_to_matching, FALSE) AS mentor_matching
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN email_preferences e ON e.user_id = u.id
    LEFT JOIN mentorship_preferences m ON m.profile_id = p.id WHERE u.id = $1`, [userId])).rows[0];
  const { profile_id, ...settings } = row || { profile_id: null, show_in_directory: true, profile_visibility: "members" as const, weekly_digest: false, session_emails: true, mentor_matching: false };
  return { ...settings, has_profile: Boolean(profile_id) };
}

export type PrivacyInput = Pick<PrivacySettings, "show_in_directory" | "profile_visibility" | "weekly_digest" | "session_emails">;

export function parsePrivacy(data: FormData): PrivacyInput {
  const visibility = data.get("profile_visibility");
  return {
    show_in_directory: data.get("show_in_directory") === "on",
    profile_visibility: visibility === "connections" ? "connections" : "members",
    weekly_digest: data.get("weekly_digest") === "on",
    session_emails: data.get("session_emails") === "on",
  };
}

export async function logConsent(db: Queryable, userId: string, kind: "mentor_matching" | "directory_listing" | "profile_visibility" | "weekly_digest" | "session_emails", value: string) {
  await db.query("INSERT INTO privacy_consents (user_id, kind, value, policy_version) VALUES ($1, $2, $3, $4)", [userId, kind, value, PRIVACY_POLICY_VERSION]);
}

/** Saves the choices and records each one that changed in the consent history. */
export async function savePrivacy(userId: string, input: PrivacyInput) {
  const before = await privacySettings(userId);
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    if (before.has_profile) {
      await conn.query("UPDATE profiles SET show_in_directory = $2, profile_visibility = $3, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1",
        [userId, input.show_in_directory, input.profile_visibility]);
      if (before.show_in_directory !== input.show_in_directory) await logConsent(conn, userId, "directory_listing", input.show_in_directory ? "listed" : "hidden");
      if (before.profile_visibility !== input.profile_visibility) await logConsent(conn, userId, "profile_visibility", input.profile_visibility);
    }
    await conn.query(`INSERT INTO email_preferences (user_id, weekly_digest, session_emails) VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET weekly_digest = EXCLUDED.weekly_digest, session_emails = EXCLUDED.session_emails, updated_at = CURRENT_TIMESTAMP`,
    [userId, input.weekly_digest, input.session_emails]);
    if (before.weekly_digest !== input.weekly_digest) await logConsent(conn, userId, "weekly_digest", input.weekly_digest ? "granted" : "withdrawn");
    if (before.session_emails !== input.session_emails) await logConsent(conn, userId, "session_emails", input.session_emails ? "granted" : "withdrawn");
    await conn.query("COMMIT");
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function consentHistory(userId: string) {
  return (await database().query<{ kind: string; value: string; policy_version: string; created_at: string }>(
    "SELECT kind, value, policy_version, created_at FROM privacy_consents WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 20", [userId])).rows;
}

/**
 * A machine-readable copy of everything Lumina holds about the member. Other
 * members appear only by name; secrets (password hash, Google subject, tokens)
 * and internal identifiers of other people are never included.
 */
export async function exportMyData(userId: string) {
  const db = database();
  const one = async (sql: string) => (await db.query(sql, [userId])).rows[0] || null;
  const many = async (sql: string) => (await db.query(sql, [userId])).rows;
  const other = (column: string) => `(SELECT full_name FROM profiles WHERE user_id = ${column})`;
  const data = {
    exported_at: new Date().toISOString(),
    policy_version: PRIVACY_POLICY_VERSION,
    account: await one(`SELECT email, role, account_status, alumni_verified, email_verified, created_at,
      password_hash IS NOT NULL AS has_password, google_subject IS NOT NULL AS has_google_sign_in FROM users WHERE id = $1`),
    registry_record: await one("SELECT synthetic_staff_number AS staff_number, former_kq_department, kq_start_year, kq_end_year, claimed_at FROM alumni_registry WHERE claimed_by_user_id = $1"),
    profile: await one(`SELECT full_name, headline, biography, former_kq_role, former_kq_department, kq_start_year, kq_end_year, current_job_title,
      current_organization, industry, location, open_to_opportunities, banner_theme, show_in_directory, profile_visibility, profile_completed, created_at, updated_at
      FROM profiles WHERE user_id = $1`),
    profile_photo: await one(`SELECT f.content_type, f.updated_at, encode(f.data, 'base64') AS base64 FROM profile_photos f JOIN profiles p ON p.id = f.profile_id WHERE p.user_id = $1`),
    work_experience: await many(`SELECT w.organization, w.job_title, w.start_date, w.end_date, w.is_current, w.description FROM work_experience w
      JOIN profiles p ON p.id = w.profile_id WHERE p.user_id = $1 ORDER BY w.start_date DESC NULLS LAST`),
    skills: (await many(`SELECT s.name FROM profile_skills ps JOIN skills s ON s.id = ps.skill_id JOIN profiles p ON p.id = ps.profile_id WHERE p.user_id = $1 ORDER BY s.name`)).map(r => r.name),
    mentorship_preferences: await one(`SELECT m.consent_to_matching, m.available_for_mentorship, m.mentorship_topics FROM mentorship_preferences m
      JOIN profiles p ON p.id = m.profile_id WHERE p.user_id = $1`),
    connections: await many(`SELECT CASE WHEN requester_id = $1 THEN ${other("addressee_id")} ELSE ${other("requester_id")} END AS person,
      CASE WHEN requester_id = $1 THEN 'sent' ELSE 'received' END AS direction, status, created_at, responded_at
      FROM connections WHERE $1 IN (requester_id, addressee_id) ORDER BY created_at`),
    messages: await many(`SELECT CASE WHEN c.user_a = $1 THEN ${other("c.user_b")} ELSE ${other("c.user_a")} END AS conversation_with,
      CASE WHEN m.sender_id = $1 THEN 'you' ELSE 'them' END AS sender, m.body, m.created_at, m.read_at
      FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE $1 IN (c.user_a, c.user_b) ORDER BY m.created_at`),
    mentorship_requests: await many(`SELECT CASE WHEN mentee_id = $1 THEN 'mentee' ELSE 'mentor' END AS your_role,
      CASE WHEN mentee_id = $1 THEN ${other("mentor_id")} ELSE ${other("mentee_id")} END AS other_person, goal, message, status, created_at, responded_at
      FROM mentorship_requests WHERE $1 IN (mentee_id, mentor_id) ORDER BY created_at`),
    mentorship_feedback: await many("SELECT match_rating, would_recommend, comment, created_at, updated_at FROM mentorship_feedback WHERE rater_id = $1"),
    availability: await many("SELECT starts_at, ends_at, mode, details, status FROM mentor_availability WHERE mentor_id = $1 ORDER BY starts_at"),
    sessions: await many(`SELECT a.starts_at, a.ends_at, a.mode, s.agenda, s.status, s.created_at FROM mentorship_sessions s
      JOIN mentor_availability a ON a.id = s.slot_id JOIN mentorship_requests r ON r.id = s.mentorship_id
      WHERE $1 IN (r.mentee_id, r.mentor_id) ORDER BY a.starts_at`),
    session_recaps: await many(`SELECT CASE WHEN author_id = $1 THEN 'author' ELSE 'approver' END AS your_role, topic, session_date, takeaways, status, created_at, decided_at
      FROM session_recaps WHERE $1 IN (author_id, partner_id) ORDER BY created_at`),
    recap_reactions: await many("SELECT r.topic, x.created_at FROM recap_reactions x JOIN session_recaps r ON r.id = x.recap_id WHERE x.user_id = $1"),
    event_registrations: await many("SELECT e.title, e.starts_at, g.registered_at FROM event_registrations g JOIN events e ON e.id = g.event_id WHERE g.user_id = $1"),
    notifications: await many("SELECT kind, created_at, read_at FROM notifications WHERE user_id = $1 ORDER BY created_at"),
    mentor_searches: await many("SELECT source, result_count, created_at FROM mentor_search_events WHERE searcher_id = $1 ORDER BY created_at"),
    email_preferences: await one("SELECT weekly_digest, session_emails, updated_at FROM email_preferences WHERE user_id = $1"),
    consent_history: await many("SELECT kind, value, policy_version, created_at FROM privacy_consents WHERE user_id = $1 ORDER BY created_at"),
  };
  await recordAudit(db, userId, "account.export", "user", null);
  return data;
}

export class AccountDeletionError extends Error {}

/**
 * Permanently deletes the member and everything that belongs to them. The staff
 * record they claimed is released so they can rejoin later. Administrators must
 * first hand over the role. The audit entry keeps no personal details.
 */
export async function deleteMyAccount(userId: string, confirmation: unknown, password: unknown) {
  if (confirmation !== "DELETE") throw new AccountDeletionError("Type DELETE to confirm.");
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const user = (await conn.query<{ role: string; password_hash: string | null }>("SELECT role, password_hash FROM users WHERE id = $1 FOR UPDATE", [userId])).rows[0];
    if (!user) throw new AccountDeletionError("This account no longer exists.");
    if (user.role === "admin") throw new AccountDeletionError("Administrator accounts can't be deleted here. Ask another administrator to change your role first.");
    if (user.password_hash && !(typeof password === "string" && await verifyPassword(password, user.password_hash))) {
      throw new AccountDeletionError("Your password is incorrect.");
    }
    await conn.query("UPDATE alumni_registry SET claimed_by_user_id = NULL, claimed_at = NULL WHERE claimed_by_user_id = $1", [userId]);
    await conn.query("DELETE FROM verification_assistance_requests WHERE user_id = $1", [userId]);
    await recordAudit(conn, userId, "account.delete", "user", null, { role: user.role });
    await conn.query("DELETE FROM users WHERE id = $1", [userId]);
    await conn.query("COMMIT");
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}
