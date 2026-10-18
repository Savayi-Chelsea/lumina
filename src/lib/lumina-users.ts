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

export async function findLuminaUser(id: string): Promise<LuminaUser | null> {
  const result = await database().query<LuminaUser>(
    `SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}
