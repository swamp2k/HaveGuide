import { nowIso } from '../utils/time';

interface UserRow {
  id: string;
  username: string;
  username_normalized: string;
  password_hash: string;
}

export async function countUsers(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function findUserByNormalizedUsername(db: D1Database, normalized: string): Promise<UserRow | null> {
  return db
    .prepare('SELECT id, username, username_normalized, password_hash FROM users WHERE username_normalized = ? LIMIT 1')
    .bind(normalized)
    .first<UserRow>();
}

export async function createFirstUser(
  db: D1Database,
  username: string,
  normalized: string,
  passwordHash: string,
): Promise<{ id: string; username: string } | null> {
  if ((await countUsers(db)) > 0) return null;
  const id = crypto.randomUUID();
  const now = nowIso();
  try {
    await db
      .prepare('INSERT INTO users (id, username, username_normalized, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, username, normalized, passwordHash, now, now)
      .run();
    return { id, username };
  } catch {
    return null;
  }
}

export async function updatePasswordHash(db: D1Database, userId: string, passwordHash: string): Promise<void> {
  await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(passwordHash, nowIso(), userId).run();
}
