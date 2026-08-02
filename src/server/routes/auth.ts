import { Hono } from 'hono';
import { credentialsSchema } from '../../shared/schemas';
import type { AppEnvironment } from '../types';
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from '../auth/cookies';
import { hashPassword, randomToken, sha256, verifyPassword } from '../auth/crypto';
import { requireAuth } from '../middleware/auth';
import {
  clearLoginFailures,
  isLoginBlocked,
  pruneLoginFailures,
  recordLoginFailure,
} from '../repositories/login-attempts';
import { createSession, deleteSessionByTokenHash } from '../repositories/sessions';
import { countUsers, createFirstUser, findUserByNormalizedUsername } from '../repositories/users';
import { jsonError } from '../utils/response';
import { addDays } from '../utils/time';
import { getClientIp, normalizeUsername, parseJson } from '../utils/request';

export const authRoutes = new Hono<AppEnvironment>();

async function issueSession(c: Parameters<typeof authRoutes.post>[1] extends never ? never : any, userId: string) {
  const sessionDays = Math.min(Math.max(Number.parseInt(c.env.SESSION_DAYS || '30', 10), 1), 365);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = addDays(new Date(), sessionDays).toISOString();
  const ipHash = await sha256(getClientIp(c));
  await createSession(c.env.DB, {
    userId,
    tokenHash,
    expiresAt,
    userAgent: c.req.header('User-Agent') ?? null,
    ipHash,
  });
  writeSessionCookie(c, token, sessionDays * 24 * 60 * 60);
}

authRoutes.get('/bootstrap', async (c) => {
  const setupRequired = (await countUsers(c.env.DB)) === 0;
  const token = readSessionCookie(c);
  if (!token) return c.json({ setupRequired, authenticated: false, user: null });

  const tokenHash = await sha256(token);
  const row = await c.env.DB
    .prepare(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ? LIMIT 1`,
    )
    .bind(tokenHash, new Date().toISOString())
    .first<{ id: string; username: string }>();

  return c.json({ setupRequired, authenticated: Boolean(row), user: row ?? null });
});

authRoutes.post('/setup', async (c) => {
  const raw = await parseJson<unknown>(c);
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 422, 'Kontrollér brugernavn og adgangskode.', 'INVALID_INPUT', parsed.error.flatten());

  const usernameNormalized = normalizeUsername(parsed.data.username);
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await createFirstUser(c.env.DB, parsed.data.username.trim(), usernameNormalized, passwordHash);
  if (!user) return jsonError(c, 409, 'Den første bruger er allerede oprettet.', 'SETUP_COMPLETE');

  await issueSession(c, user.id);
  return c.json({ user }, 201);
});

authRoutes.post('/login', async (c) => {
  const raw = await parseJson<unknown>(c);
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 422, 'Kontrollér loginoplysningerne.', 'INVALID_INPUT');

  const usernameNormalized = normalizeUsername(parsed.data.username);
  const identityHash = await sha256(`${getClientIp(c)}|${usernameNormalized}`);
  if (await isLoginBlocked(c.env.DB, identityHash)) {
    return jsonError(c, 429, 'For mange loginforsøg. Prøv igen om 15 minutter.', 'LOGIN_RATE_LIMIT');
  }

  const user = await findUserByNormalizedUsername(c.env.DB, usernameNormalized);
  const valid = user ? await verifyPassword(parsed.data.password, user.password_hash) : false;
  if (!user || !valid) {
    await recordLoginFailure(c.env.DB, identityHash);
    return jsonError(c, 401, 'Forkert brugernavn eller adgangskode.', 'INVALID_CREDENTIALS');
  }

  await clearLoginFailures(c.env.DB, identityHash);
  await issueSession(c, user.id);
  c.executionCtx.waitUntil(pruneLoginFailures(c.env.DB));
  return c.json({ user: { id: user.id, username: user.username } });
});

authRoutes.post('/logout', async (c) => {
  const token = readSessionCookie(c);
  if (token) await deleteSessionByTokenHash(c.env.DB, await sha256(token));
  clearSessionCookie(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', requireAuth, (c) => c.json({ user: c.get('user') }));
