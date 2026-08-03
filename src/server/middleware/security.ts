import type { MiddlewareHandler } from 'hono';
import type { AppEnvironment } from '../types';
import { jsonError } from '../utils/response';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const securityHeaders: MiddlewareHandler<AppEnvironment> = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self)');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' https://tile.openstreetmap.org; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  );
};

export const sameOriginWrites: MiddlewareHandler<AppEnvironment> = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method)) {
    await next();
    return;
  }

  const origin = c.req.header('Origin');
  if (!origin) {
    await next();
    return;
  }

  const requestUrl = new URL(c.req.url);
  if (origin !== requestUrl.origin) {
    return jsonError(c, 403, 'Forespørgslen kom fra en ukendt oprindelse.', 'ORIGIN_MISMATCH');
  }

  await next();
};
