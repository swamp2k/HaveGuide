import type { Context } from 'hono';
import type { AppEnvironment } from '../types';

export async function parseJson<T>(c: Context<AppEnvironment>): Promise<T | null> {
  try {
    return await c.req.json<T>();
  } catch {
    return null;
  }
}

export function normalizeUsername(value: string): string {
  return value.trim().toLocaleLowerCase('da-DK');
}

export function getClientIp(c: Context<AppEnvironment>): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown';
}
