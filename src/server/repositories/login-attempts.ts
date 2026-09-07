import { nowIso } from '../utils/time';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;

function cutoffIso(): string {
  return new Date(Date.now() - WINDOW_MS).toISOString();
}

export async function isLoginBlocked(db: D1Database, identityHash: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE identity_hash = ? AND attempted_at >= ?')
    .bind(identityHash, cutoffIso())
    .first<{ count: number }>();
  return Number(row?.count ?? 0) >= MAX_FAILURES;
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
  await db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').bind(cutoffIso()).run();
}
