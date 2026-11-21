import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { database } from "@/lib/db";

export const RESET_TOKEN_MINUTES = 30;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const digest = (token: string) => createHash("sha256").update(token).digest();

/**
 * Issues a single-use token for an active or pending password account.
 * Google-only, synthetic non-login and suspended accounts never receive one.
 * Earlier unused tokens for the account are revoked.
 */
export async function issueResetToken(email: string): Promise<string | null> {
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const user = (await conn.query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1 AND password_hash LIKE '$argon2id$%' AND account_status <> 'suspended' FOR UPDATE`, [email])).rows[0];
    if (!user) { await conn.query("ROLLBACK"); return null; }
    const token = randomBytes(32).toString("base64url");
    await conn.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [user.id]);
    await conn.query(`INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP + make_interval(mins => $3))`, [digest(token), user.id, RESET_TOKEN_MINUTES]);
    await conn.query("COMMIT");
    return token;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

/** Atomically consumes a valid token and replaces the password hash. Returns the account email. */
export async function consumeResetToken(token: string, passwordHash: string): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const row = (await conn.query<{ user_id: string; email: string }>(`SELECT t.user_id, u.email FROM password_reset_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP AND u.account_status <> 'suspended'
      FOR UPDATE OF t, u`, [digest(token)])).rows[0];
    if (!row) { await conn.query("ROLLBACK"); return null; }
    await conn.query("UPDATE users SET password_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1", [row.user_id, passwordHash]);
    await conn.query("UPDATE password_reset_tokens SET used_at = CURRENT_TIMESTAMP WHERE token_hash = $1", [digest(token)]);
    await conn.query("DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL", [row.user_id]);
    await conn.query("COMMIT");
    return row.email;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export function resetEmail(link: string) {
  const text = `Someone asked to reset the password for your Lumina account.

Choose a new password here (the link works once and expires in ${RESET_TOKEN_MINUTES} minutes):
${link}

If you didn't ask for this, you can ignore this email. Your password won't change.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;color:#292529">
<h1 style="font-family:Georgia,serif;font-weight:500;color:#481729">Reset your Lumina password</h1>
<p>Someone asked to reset the password for your Lumina account.</p>
<p><a href="${link}" style="display:inline-block;background:#a21f36;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Choose a new password</a></p>
<p style="color:#70656a;font-size:14px">The link works once and expires in ${RESET_TOKEN_MINUTES} minutes. If you didn't ask for this, you can ignore this email. Your password won't change.</p>
</div>`;
  return { subject: "Reset your Lumina password", text, html };
}
