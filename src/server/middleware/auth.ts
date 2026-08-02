import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '../types';
import { readSessionCookie } from '../auth/cookies';
import { sha256 } from '../auth/crypto';
import { findSessionByTokenHash, touchSession } from '../repositories/sessions';
import { jsonError } from '../utils/response';

export const requireAuth: MiddlewareHandler<AppEnvironment> = async (c, next) => {
  const token = readSessionCookie(c);
  if (!token) return jsonError(c, 401, 'Du skal logge ind.', 'AUTH_REQUIRED');

  const tokenHash = await sha256(token);
  const authenticated = await findSessionByTokenHash(c.env.DB, tokenHash);
  if (!authenticated) return jsonError(c, 401, 'Din session er udløbet.', 'SESSION_EXPIRED');

  c.set('user', authenticated.user);
  c.set('session', authenticated.session);
  await touchSession(c.env.DB, authenticated.session.id);
  await next();
};
