import { nowIso } from '../utils/time';

export async function createSession(
  db: D1Database,
  input: { userId: string; tokenHash: string; expiresAt: string; userAgent: string | null; ipHash: string },
): Promise<void> {
  const now = nowIso();
  await db
    .prepare(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(crypto.randomUUID(), input.userId, input.tokenHash, input.expiresAt, now, now, input.userAgent, input.ipHash)
    .run();
}

export async function deleteSessionByTokenHash(db: D1Database, tokenHash: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export async function pruneExpiredSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso()).run();
}
