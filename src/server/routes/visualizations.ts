import { Hono } from 'hono';
import type { AppEnvironment } from '../types';
import { requireAuth } from '../middleware/auth';
import { findOwnedVisualizationObject } from '../repositories/scenes';
import { jsonError } from '../utils/response';

/**
 * Serves generated images. Kept on its own path rather than /api/images so the ownership check
 * runs against the visualization row; R2 keys are never accepted from or exposed to the client.
 */
export const visualizationRoutes = new Hono<AppEnvironment>();
visualizationRoutes.use('*', requireAuth);

visualizationRoutes.get('/:visualizationId', async (c) => {
  const record = await findOwnedVisualizationObject(
    c.env.DB,
    c.get('user').id,
    c.req.param('visualizationId'),
  );
  if (!record) return jsonError(c, 404, 'Visualiseringen findes ikke.', 'VISUALIZATION_NOT_FOUND');

  const object = await c.env.MEDIA.get(record.r2_key);
  if (!object) return jsonError(c, 404, 'Billedfilen mangler.', 'IMAGE_OBJECT_NOT_FOUND');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', record.content_type);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
});
