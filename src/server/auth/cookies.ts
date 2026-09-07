import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { AppEnvironment } from '../types';

const COOKIE_NAME = 'haveguide_session';

export function readSessionCookie(c: Context<AppEnvironment>): string | undefined {
  return getCookie(c, COOKIE_NAME);
}

export function writeSessionCookie(c: Context<AppEnvironment>, token: string, maxAge: number): void {
  setCookie(c, COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: c.env.APP_ENV === 'production',
    maxAge,
  });
}

export function clearSessionCookie(c: Context<AppEnvironment>): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}
