import { nowIso } from '../utils/time';

const WINDOW_MINUTES = 15;
const MAX_ATTEMPTS = 5;

function windowStartIso(): string {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
}

export async function isLoginBlocked(db: D1Database, identityHash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE identity_hash = ? AND attempted_at >= ?')
    .bind(identityHash, windowStartIso())
    .first<{ count: number }>();
  return (row?.count ?? 0) >= MAX_ATTEMPTS;
}

export async function recordLoginFailure(db: D1Database, identityHash: string): Promise<void> {
  await db
    .prepare('INSERT INTO login_attempts (id, identity_hash, attempted_at) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), identityHash, nowIso())
    .run();
}

export async function clearLoginFailures(db: D1Database, identityHash: string): Promise<void> {
  await db.prepare('DELETE FROM login_attempts WHERE identity_hash = ?').bind(identityHash).run();
}

export async function pruneLoginFailures(db: D1Database): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(cutoff).run();
}
