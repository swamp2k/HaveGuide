import type { Context } from 'hono';
import type { AppEnvironment } from '../types';

export function jsonError(
  c: Context<AppEnvironment>,
  status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503,
  message: string,
  code: string,
  details?: unknown,
) {
  return c.json({ error: { message, code, details } }, status);
}
