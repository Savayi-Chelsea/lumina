import "server-only";
import { database } from "@/lib/db";
import { notify } from "@/lib/notifications";
import { profileImageSql } from "@/lib/profile-image-sql";
import { profileImage } from "@/lib/profile-image";
import { uuidPattern } from "@/lib/community-input";

// The same discoverability rule as the Network directory.
export const discoverableUser = (u: string, p: string) => `${u}.account_status = 'active' AND ${u}.alumni_verified = TRUE AND ${u}.role = 'alumni' AND length(btrim(${p}.full_name)) > 0`;

export type Member = { user_id: string; profile_id: string; full_name: string; headline: string | null; current_job_title: string | null; current_organization: string | null; image: string | null };
export type ConnectionState = "self" | "none" | "outgoing" | "incoming" | "connected";

const memberFields = `u.id AS user_id, p.id AS profile_id, p.full_name, p.headline, p.current_job_title, p.current_organization, ${profileImageSql("p", "u")} AS image`;
const clean = <T extends { image: string | null }>(row: T) => ({ ...row, image: profileImage(row.image) });

/** Resolves a public profile id to its owner, only if that member is discoverable. */
export async function memberByProfile(profileId: string): Promise<Member | null> {
  if (!uuidPattern.test(profileId)) return null;
  const row = (await database().query<Member>(`SELECT ${memberFields} FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE p.id = $1 AND ${discoverableUser("u", "p")}`, [profileId])).rows[0];
  return row ? clean(row) : null;
}

export async function connectionState(viewerId: string, otherId: string): Promise<{ state: ConnectionState; id: string | null }> {
  if (viewerId === otherId) return { state: "self", id: null };
  const row = (await database().query<{ id: string; requester_id: string; status: string }>(`SELECT id, requester_id, status FROM connections
    WHERE LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid) AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid)`, [viewerId, otherId])).rows[0];
  if (!row || row.status === "declined") return { state: "none", id: row?.id ?? null };
  if (row.status === "accepted") return { state: "connected", id: row.id };
  return { state: row.requester_id === viewerId ? "outgoing" : "incoming", id: row.id };
}

export type ConnectOutcome = "sent" | "accepted" | "already" | "unavailable";

/**
 * Sends a request, or accepts the other person's pending request. A declined
 * request can be re-sent later; the pair always has a single row.
 */
export async function requestConnection(fromId: string, toProfileId: string): Promise<ConnectOutcome> {
  const target = await memberByProfile(toProfileId);
  if (!target || target.user_id === fromId) return "unavailable";
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SELECT pg_advisory_xact_lock(hashtext(LEAST($1::text, $2::text) || GREATEST($1::text, $2::text)))", [fromId, target.user_id]);
    const existing = (await conn.query<{ id: string; requester_id: string; status: string }>(`SELECT id, requester_id, status FROM connections
      WHERE LEAST(requester_id, addressee_id) = LEAST($1::uuid, $2::uuid) AND GREATEST(requester_id, addressee_id) = GREATEST($1::uuid, $2::uuid) FOR UPDATE`, [fromId, target.user_id])).rows[0];
    let outcome: ConnectOutcome;
    if (existing?.status === "accepted" || (existing?.status === "pending" && existing.requester_id === fromId)) outcome = "already";
    else if (existing?.status === "pending") {
      await conn.query("UPDATE connections SET status = 'accepted', responded_at = CURRENT_TIMESTAMP WHERE id = $1", [existing.id]);
      await notify(conn, target.user_id, fromId, "connection_accepted", "/network/connections");
      outcome = "accepted";
    } else {
      if (existing) await conn.query("UPDATE connections SET requester_id = $2, addressee_id = $3, status = 'pending', created_at = CURRENT_TIMESTAMP, responded_at = NULL WHERE id = $1", [existing.id, fromId, target.user_id]);
      else await conn.query("INSERT INTO connections (requester_id, addressee_id) VALUES ($1, $2)", [fromId, target.user_id]);
      await notify(conn, target.user_id, fromId, "connection_request", "/network/connections");
      outcome = "sent";
    }
    await conn.query("COMMIT");
    return outcome;
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

/** Only the person who received the request can answer it. */
export async function respondToConnection(userId: string, connectionId: string, accept: boolean) {
  if (!uuidPattern.test(connectionId)) return false;
  const conn = await database().connect();
  try {
    await conn.query("BEGIN");
    const row = (await conn.query<{ requester_id: string }>(`UPDATE connections SET status = $3, responded_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND addressee_id = $2 AND status = 'pending' RETURNING requester_id`, [connectionId, userId, accept ? "accepted" : "declined"])).rows[0];
    if (row && accept) await notify(conn, row.requester_id, userId, "connection_accepted", "/network/connections");
    await conn.query("COMMIT");
    return Boolean(row);
  } catch (error) {
    await conn.query("ROLLBACK");
    throw error;
  } finally {
    conn.release();
  }
}

/** Removes an accepted connection or withdraws one's own pending request. */
export async function removeConnection(userId: string, connectionId: string) {
  if (!uuidPattern.test(connectionId)) return false;
  return Boolean((await database().query(`DELETE FROM connections WHERE id = $1
    AND ((status = 'accepted' AND $2 IN (requester_id, addressee_id)) OR (status = 'pending' AND requester_id = $2))`, [connectionId, userId])).rowCount);
}

export async function myNetwork(userId: string) {
  const db = database();
  const [connections, incoming, outgoing] = await Promise.all([
    db.query<Member & { connection_id: string }>(`SELECT c.id AS connection_id, ${memberFields} FROM connections c
      JOIN users u ON u.id = CASE WHEN c.requester_id = $1 THEN c.addressee_id ELSE c.requester_id END JOIN profiles p ON p.user_id = u.id
      WHERE c.status = 'accepted' AND $1 IN (c.requester_id, c.addressee_id) AND u.account_status = 'active' ORDER BY lower(p.full_name)`, [userId]),
    db.query<Member & { connection_id: string }>(`SELECT c.id AS connection_id, ${memberFields} FROM connections c
      JOIN users u ON u.id = c.requester_id JOIN profiles p ON p.user_id = u.id
      WHERE c.addressee_id = $1 AND c.status = 'pending' AND u.account_status = 'active' ORDER BY c.created_at DESC`, [userId]),
    db.query<Member & { connection_id: string }>(`SELECT c.id AS connection_id, ${memberFields} FROM connections c
      JOIN users u ON u.id = c.addressee_id JOIN profiles p ON p.user_id = u.id
      WHERE c.requester_id = $1 AND c.status = 'pending' ORDER BY c.created_at DESC`, [userId]),
  ]);
  return { connections: connections.rows.map(clean), incoming: incoming.rows.map(clean), outgoing: outgoing.rows.map(clean) };
}

export async function connectionCount(userId: string) {
  return Number((await database().query<{ n: number }>(`SELECT count(*)::int AS n FROM connections WHERE status = 'accepted' AND $1 IN (requester_id, addressee_id)`, [userId])).rows[0].n);
}

/**
 * People you may know: discoverable alumni you are not yet linked with, ranked by
 * shared former department, shared skills and shared current industry.
 */
export async function suggestions(userId: string, limit = 6) {
  return (await database().query<Member & { shared_skills: number; same_department: boolean }>(`
    WITH me AS (SELECT p.id, p.former_kq_department, p.industry FROM profiles p WHERE p.user_id = $1),
    mine AS (SELECT ps.skill_id FROM profile_skills ps JOIN me ON ps.profile_id = me.id)
    SELECT ${memberFields},
      (SELECT count(*)::int FROM profile_skills ps WHERE ps.profile_id = p.id AND ps.skill_id IN (SELECT skill_id FROM mine)) AS shared_skills,
      COALESCE(p.former_kq_department = (SELECT former_kq_department FROM me), FALSE) AS same_department
    FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE ${discoverableUser("u", "p")} AND u.id <> $1
      AND NOT EXISTS (SELECT 1 FROM connections c WHERE c.status <> 'declined'
        AND LEAST(c.requester_id, c.addressee_id) = LEAST(u.id, $1::uuid) AND GREATEST(c.requester_id, c.addressee_id) = GREATEST(u.id, $1::uuid))
    ORDER BY same_department DESC, shared_skills DESC, (p.industry = (SELECT industry FROM me)) DESC NULLS LAST, p.id
    LIMIT $2`, [userId, limit])).rows.map(clean);
}
