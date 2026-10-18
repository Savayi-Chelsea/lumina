import "server-only";
import { googleProfileImage } from "@/lib/profile-image";
import { database } from "@/lib/db";

export type LuminaUser = {
  id: string;
  role: "alumni" | "admin";
  account_status: "active" | "pending" | "suspended";
  alumni_verified: boolean;
};

const USER_FIELDS = "id, role, account_status, alumni_verified";

export class IdentityLinkRequired extends Error {
  constructor() { super("Existing account requires explicit identity linking"); }
}

export async function linkGoogleUser(subject: string, email: string, image?: string | null): Promise<LuminaUser> {
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const existing = await conn.query<LuminaUser>(
      `SELECT ${USER_FIELDS} FROM users WHERE google_subject = $1 FOR UPDATE`, [subject]);
    let user = existing.rows[0];
    if (!user) {
      // A matching email must never silently link or overwrite an existing account.
      const inserted = await conn.query<LuminaUser>(
        `INSERT INTO users (email, password_hash, role, account_status, email_verified, google_subject, alumni_verified)
         VALUES ($1, NULL, 'alumni', 'pending', TRUE, $2, FALSE)
         ON CONFLICT DO NOTHING RETURNING ${USER_FIELDS}`, [email, subject]);
      user = inserted.rows[0];
      if (!user) {
        // A simultaneous sign-in may have inserted this same stable Google subject.
        const concurrent = await conn.query<LuminaUser>(
          `SELECT ${USER_FIELDS} FROM users WHERE google_subject = $1 FOR UPDATE`, [subject]);
        user = concurrent.rows[0];
        if (!user) throw new IdentityLinkRequired();
      }
    }
    if (user.account_status === "suspended") throw new Error("Account unavailable");
    if (image !== undefined) await conn.query("UPDATE users SET google_image_url = $2 WHERE id = $1", [user.id, googleProfileImage(image)]);
    await conn.query("COMMIT");
    return user;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

/** True when a new Google identity would collide with an account that already owns the email. */
export async function googleEmailConflict(subject: string, email: string): Promise<boolean> {
  const result = await database().query<{ conflict: boolean }>(
    `SELECT NOT EXISTS (SELECT 1 FROM users WHERE google_subject = $1)
       AND EXISTS (SELECT 1 FROM users WHERE lower(email) = lower($2)) AS conflict`, [subject, email]);
  return result.rows[0]?.conflict === true;
}

export type PasswordAccount = Pick<LuminaUser, "id" | "account_status"> & { password_hash: string | null; full_name: string | null };

/** Server-only lookup; the hash never leaves the authorize step. */
export async function findPasswordAccount(email: string): Promise<PasswordAccount | null> {
  const result = await database().query<PasswordAccount>(
    `SELECT u.id, u.account_status, u.password_hash, p.full_name
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.email = $1`, [email]);
  return result.rows[0] || null;
}

/**
 * Creates a pending, unverified alumni account with a name-only draft profile.
 * Registration never asserts former Kenya Airways employment.
 */
export async function createPasswordUser(fullName: string, email: string, passwordHash: string): Promise<"created" | "duplicate"> {
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    // Serialises concurrent registrations for the same normalised email.
    await conn.query("SELECT pg_advisory_xact_lock(hashtext($1))", [email]);
    const existing = await conn.query("SELECT 1 FROM users WHERE lower(email) = $1", [email]);
    const inserted = existing.rowCount ? { rows: [] } : await conn.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, role, account_status, email_verified, alumni_verified)
       VALUES ($1, $2, 'alumni', 'pending', FALSE, FALSE)
       ON CONFLICT DO NOTHING RETURNING id`, [email, passwordHash]);
    const user = inserted.rows[0];
    if (!user) { await conn.query("ROLLBACK"); return "duplicate"; }
    await conn.query("INSERT INTO profiles (user_id, full_name, profile_completed) VALUES ($1, $2, FALSE)", [user.id, fullName]);
    await conn.query("COMMIT");
    return "created";
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function findLuminaUser(id: string): Promise<LuminaUser | null> {
  const result = await database().query<LuminaUser>(
    `SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}
