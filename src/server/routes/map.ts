import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth';
import type { AppEnvironment } from '../types';
import { jsonError } from '../utils/response';

const TILE_PATTERN = /^\d+$/;

export const mapRoutes = new Hono<AppEnvironment>();
mapRoutes.use('*', requireAuth);

mapRoutes.get('/config', (c) => c.json({
  aerialAvailable: Boolean(c.env.DATAFORDELER_API_KEY),
  aerialProvider: c.env.DATAFORDELER_API_KEY ? 'GeoDanmark Ortofoto forår 2025' : null,
}));

mapRoutes.get('/orthophoto/:z/:x/:y', async (c) => {
  const apiKey = c.env.DATAFORDELER_API_KEY;
  if (!apiKey) {
    return jsonError(c, 404, 'Luftfoto er ikke aktiveret.', 'AERIAL_NOT_CONFIGURED');
  }

  const z = c.req.param('z');
  const x = c.req.param('x');
  const y = c.req.param('y').replace(/\.(?:jpg|jpeg|png)$/i, '');
  if (![z, x, y].every((value) => TILE_PATTERN.test(value))) {
    return jsonError(c, 400, 'Tile-koordinaterne er ikke gyldige.', 'INVALID_TILE');
  }

  const cache = caches.default;
  const cacheKey = new Request(c.req.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = new URL('https://wmts.datafordeler.dk/GeoDanmarkOrto/orto_foraar_webm/1.0.0/WMTS');
  upstream.searchParams.set('apikey', apiKey);
  upstream.searchParams.set('SERVICE', 'WMTS');
  upstream.searchParams.set('REQUEST', 'GetTile');
  upstream.searchParams.set('VERSION', '1.0.0');
  upstream.searchParams.set('STYLE', 'default');
  upstream.searchParams.set('FORMAT', 'image/jpeg');
  upstream.searchParams.set('TILEMATRIXSET', 'DFD_GoogleMapsCompatible');
  upstream.searchParams.set('TILEMATRIX', z);
  upstream.searchParams.set('TILEROW', y);
  upstream.searchParams.set('TILECOL', x);
  upstream.searchParams.set('Layer', 'orto_foraar_webm');

  const response = await fetch(upstream, {
    headers: { Accept: 'image/jpeg' },
  });
  if (!response.ok || !response.body) {
    console.warn(JSON.stringify({
      level: 'warn',
      message: 'Orthophoto tile failed',
      status: response.status,
      z,
      x,
      y,
    }));
    return jsonError(c, 502, 'Luftfotoet kunne ikke hentes.', 'AERIAL_UPSTREAM_FAILED');
  }

  const headers = new Headers();
  headers.set('Content-Type', response.headers.get('Content-Type') ?? 'image/jpeg');
  headers.set('Cache-Control', 'private, max-age=86400');
  headers.set('X-Content-Type-Options', 'nosniff');
  const tile = new Response(response.body, { status: 200, headers });
  c.executionCtx.waitUntil(cache.put(cacheKey, tile.clone()));
  return tile;
});
