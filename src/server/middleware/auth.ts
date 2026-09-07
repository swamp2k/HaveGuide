import { createMiddleware } from 'hono/factory';
import type { AppEnvironment } from '../types';
import { readSessionCookie } from '../auth/cookies';
import { sha256 } from '../auth/crypto';
import { jsonError } from '../utils/response';
import { nowIso } from '../utils/time';

export const requireAuth = createMiddleware<AppEnvironment>(async (c, next) => {
  const token = readSessionCookie(c);
  if (!token) return jsonError(c, 401, 'Du skal logge ind.', 'AUTH_REQUIRED');
  const tokenHash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT s.id AS session_id, s.expires_at, u.id AS user_id, u.username
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`,
  )
    .bind(tokenHash, nowIso())
    .first<{ session_id: string; expires_at: string; user_id: string; username: string }>();
  if (!row) return jsonError(c, 401, 'Din session er udløbet.', 'SESSION_EXPIRED');

  c.set('user', { id: row.user_id, username: row.username });
  c.set('session', { id: row.session_id, tokenHash, expiresAt: row.expires_at });
  c.executionCtx.waitUntil(
    c.env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(nowIso(), row.session_id).run().then(() => undefined),
  );
  await next();
});
