import type { Context } from 'hono';

export function jsonError(c: Context, status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500, error: string, code?: string, details?: unknown) {
  return c.json({ error, ...(code ? { code } : {}), ...(details ? { details } : {}) }, status);
}
