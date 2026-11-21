import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { profileImageSql } from "@/lib/profile-image-sql";
import { profileImage } from "@/lib/profile-image";
import { uuidPattern } from "@/lib/community-input";

export const MESSAGE_MAX = 2000;
type Queryable = Pick<PoolClient, "query">;

export type ConversationSummary = {
  id: string; other_user_id: string; other_profile_id: string | null; other_name: string | null; other_image: string | null;
  last_body: string | null; last_sender_id: string | null; last_message_at: string | null; unread: number;
};
export type Message = { id: string; sender_id: string; body: string; created_at: string; read_at: string | null };

/** Members may message each other once connected, or within an accepted mentorship. */
export async function canMessage(db: Queryable, a: string, b: string) {
  if (a === b) return false;
  const row = (await db.query<{ allowed: boolean }>(`SELECT (
      EXISTS (SELECT 1 FROM connections WHERE status = 'accepted' AND LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid) AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid))
      OR EXISTS (SELECT 1 FROM mentorship_requests WHERE status = 'accepted' AND ((mentee_id = $1 AND mentor_id = $2) OR (mentee_id = $2 AND mentor_id = $1)))
    ) AND EXISTS (SELECT 1 FROM users WHERE id = $2 AND account_status = 'active') AS allowed`, [a, b])).rows[0];
  return row?.allowed === true;
}

export async function conversationFor(db: Queryable, a: string, b: string) {
  const [first, second] = a < b ? [a, b] : [b, a];
  return (await db.query<{ id: string }>(`INSERT INTO conversations (user_a, user_b) VALUES ($1, $2)
    ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a RETURNING id`, [first, second])).rows[0].id;
}

export async function insertMessage(db: Queryable, conversationId: string, senderId: string, recipientId: string, body: string) {
  await db.query("INSERT INTO messages (conversation_id, sender_id, body) VALUES ($1, $2, $3)", [conversationId, senderId, body]);
  await db.query("UPDATE conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = $1", [conversationId]);
  await notify(db, recipientId, senderId, "message", `/messages/${conversationId}`);
}

export function cleanMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const body = value.normalize("NFC").replace(/\r\n/g, "\n").trim();
  if (!body || body.length > MESSAGE_MAX || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(body)) return null;
  return body;
}

/** Starts (or reuses) the conversation with another member and returns its id. */
export async function openConversation(userId: string, otherUserId: string) {
  if (!uuidPattern.test(otherUserId)) return null;
  const db = database();
  if (!await canMessage(db, userId, otherUserId)) return null;
  return conversationFor(db, userId, otherUserId);
}

export type SendOutcome = "sent" | "invalid" | "forbidden";

export async function sendMessage(userId: string, conversationId: string, rawBody: unknown): Promise<SendOutcome> {
  const body = cleanMessage(rawBody);
  if (!body) return "invalid";
  if (!uuidPattern.test(conversationId)) return "forbidden";
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const convo = (await conn.query<{ user_a: string; user_b: string }>("SELECT user_a, user_b FROM conversations WHERE id = $1 AND $2 IN (user_a, user_b) FOR UPDATE", [conversationId, userId])).rows[0];
    const other = convo && (convo.user_a === userId ? convo.user_b : convo.user_a);
    if (!other || !await canMessage(conn, userId, other)) { await conn.query("ROLLBACK"); return "forbidden"; }
    await insertMessage(conn, conversationId, userId, other, body);
    await conn.query("COMMIT");
    return "sent";
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

export async function listConversations(userId: string) {
  return (await database().query<ConversationSummary>(`SELECT c.id, o.id AS other_user_id, p.id AS other_profile_id, p.full_name AS other_name,
      ${profileImageSql("p", "o")} AS other_image, last.body AS last_body, last.sender_id AS last_sender_id, c.last_message_at,
      (SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> $1 AND m.read_at IS NULL) AS unread
    FROM conversations c
    JOIN users o ON o.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
    LEFT JOIN profiles p ON p.user_id = o.id
    LEFT JOIN LATERAL (SELECT body, sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) last ON TRUE
    WHERE $1 IN (c.user_a, c.user_b) AND c.last_message_at IS NOT NULL
    ORDER BY c.last_message_at DESC`, [userId])).rows.map(row => ({ ...row, other_image: profileImage(row.other_image) }));
}

/** Loads a conversation the user belongs to and marks the other person's messages as read. */
export async function readConversation(userId: string, conversationId: string) {
  if (!uuidPattern.test(conversationId)) return null;
  const db = database();
  const summary = (await listConversationHeader(userId, conversationId));
  if (!summary) return null;
  await db.query("UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL", [conversationId, userId]);
  await db.query(`UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND kind = 'message' AND read_at IS NULL AND link = $2`, [userId, `/messages/${conversationId}`]);
  const messages = (await db.query<Message>(`SELECT id, sender_id, body, created_at, read_at FROM (
    SELECT id, sender_id, body, created_at, read_at FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 200) recent ORDER BY created_at`, [conversationId])).rows;
  return { ...summary, messages, canReply: await canMessage(db, userId, summary.other_user_id) };
}

async function listConversationHeader(userId: string, conversationId: string) {
  const row = (await database().query<Pick<ConversationSummary, "id" | "other_user_id" | "other_profile_id" | "other_name" | "other_image"> & { other_headline: string | null }>(`SELECT c.id, o.id AS other_user_id,
      p.id AS other_profile_id, p.full_name AS other_name, p.headline AS other_headline, ${profileImageSql("p", "o")} AS other_image
    FROM conversations c JOIN users o ON o.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
    LEFT JOIN profiles p ON p.user_id = o.id WHERE c.id = $2 AND $1 IN (c.user_a, c.user_b)`, [userId, conversationId])).rows[0];
  return row ? { ...row, other_image: profileImage(row.other_image) } : null;
}
