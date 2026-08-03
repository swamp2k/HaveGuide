import type { AuthUser } from '../types';
import { nowIso } from '../utils/time';

interface UserRow {
  id: string;
  username: string;
  username_normalized: string;
  password_hash: string;
}

export async function countUsers(db: D1Database): Promise<number> {
  const result = await db.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  return result?.count ?? 0;
}

export async function createFirstUser(
  db: D1Database,
  username: string,
  usernameNormalized: string,
  passwordHash: string,
): Promise<AuthUser | null> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const result = await db
    .prepare(
      `INSERT INTO users (id, username, username_normalized, password_hash, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM users)`,
    )
    .bind(id, username, usernameNormalized, passwordHash, timestamp, timestamp)
    .run();

  if ((result.meta.changes ?? 0) !== 1) return null;
  return { id, username };
}

export async function findUserByNormalizedUsername(
  db: D1Database,
  usernameNormalized: string,
): Promise<UserRow | null> {
  return (
    (await db
      .prepare(
        `SELECT id, username, username_normalized, password_hash
         FROM users WHERE username_normalized = ? LIMIT 1`,
      )
      .bind(usernameNormalized)
      .first<UserRow>()) ?? null
  );
}

export async function updatePasswordHash(db: D1Database, userId: string, passwordHash: string): Promise<void> {
  await db
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, nowIso(), userId)
    .run();
}

export async function findUserById(db: D1Database, id: string): Promise<AuthUser | null> {
  return (
    (await db
      .prepare('SELECT id, username FROM users WHERE id = ? LIMIT 1')
      .bind(id)
      .first<AuthUser>()) ?? null
  );
}
