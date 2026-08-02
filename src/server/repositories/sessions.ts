import type { AuthUser, SessionContext } from '../types';
import { nowIso } from '../utils/time';

interface SessionRow {
  id: string;
  token_hash: string;
  expires_at: string;
  user_id: string;
  username: string;
}

export async function createSession(
  db: D1Database,
  input: {
    userId: string;
    tokenHash: string;
    expiresAt: string;
    userAgent: string | null;
    ipHash: string | null;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO sessions
       (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.userId,
      input.tokenHash,
      input.expiresAt,
      timestamp,
      timestamp,
      input.userAgent,
      input.ipHash,
    )
    .run();
  return id;
}

export async function findSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<{ user: AuthUser; session: SessionContext } | null> {
  const row = await db
    .prepare(
      `SELECT s.id, s.token_hash, s.expires_at, u.id AS user_id, u.username
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?
       LIMIT 1`,
    )
    .bind(tokenHash, nowIso())
    .first<SessionRow>();

  if (!row) return null;
  return {
    user: { id: row.user_id, username: row.username },
    session: { id: row.id, tokenHash: row.token_hash, expiresAt: row.expires_at },
  };
}

export async function touchSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(nowIso(), sessionId).run();
}

export async function deleteSessionByTokenHash(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function deleteExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso()).run();
}
