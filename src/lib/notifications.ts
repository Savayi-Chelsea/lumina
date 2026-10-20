import "server-only";
import type { PoolClient } from "pg";
import { database } from "@/lib/db";
import { profileImageSql } from "@/lib/profile-image-sql";

export type NotificationKind = "connection_request" | "connection_accepted" | "message" | "mentorship_request" | "mentorship_accepted" | "mentorship_declined";
export type Notification = { id: string; kind: NotificationKind; link: string; created_at: string; read_at: string | null; actor_name: string | null; actor_image: string | null };

type Queryable = Pick<PoolClient, "query">;

/** Messages collapse into one unread notification per sender. */
export async function notify(db: Queryable, userId: string, actorId: string, kind: NotificationKind, link: string) {
  if (userId === actorId) return;
  if (kind === "message") {
    const existing = await db.query("SELECT 1 FROM notifications WHERE user_id = $1 AND actor_id = $2 AND kind = 'message' AND read_at IS NULL", [userId, actorId]);
    if (existing.rowCount) return;
  }
  await db.query("INSERT INTO notifications (user_id, actor_id, kind, link) VALUES ($1, $2, $3, $4)", [userId, actorId, kind, link]);
}

export async function listNotifications(userId: string, limit = 50) {
  return (await database().query<Notification>(`SELECT n.id, n.kind, n.link, n.created_at, n.read_at,
      p.full_name AS actor_name, ${profileImageSql("p", "a")} AS actor_image
    FROM notifications n LEFT JOIN users a ON a.id = n.actor_id LEFT JOIN profiles p ON p.user_id = a.id
    WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT $2`, [userId, limit])).rows;
}

export async function markNotificationsRead(userId: string) {
  await database().query("UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL", [userId]);
}

/** Header badges: unread notifications (excluding messages) and unread messages. */
export async function activityCounts(userId: string) {
  return (await database().query<{ notifications: number; messages: number }>(`SELECT
    (SELECT count(*)::int FROM notifications WHERE user_id = $1 AND read_at IS NULL AND kind <> 'message') AS notifications,
    (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE (c.user_a = $1 OR c.user_b = $1) AND m.sender_id <> $1 AND m.read_at IS NULL) AS messages`, [userId])).rows[0];
}

export function notificationText(kind: NotificationKind, actor: string) {
  switch (kind) {
    case "connection_request": return `${actor} wants to connect with you.`;
    case "connection_accepted": return `${actor} accepted your connection request.`;
    case "message": return `${actor} sent you a message.`;
    case "mentorship_request": return `${actor} asked you to be their mentor.`;
    case "mentorship_accepted": return `${actor} accepted your mentorship request.`;
    case "mentorship_declined": return `${actor} isn't able to mentor you right now.`;
  }
}
