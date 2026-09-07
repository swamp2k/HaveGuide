import { Hono } from 'hono';
import type { AppEnvironment } from '../types';
import { requireAuth } from '../middleware/auth';
import { findOwnedImage } from '../repositories/scenes';
import { jsonError } from '../utils/response';

export const imageRoutes = new Hono<AppEnvironment>();
imageRoutes.use('*', requireAuth);

imageRoutes.get('/:imageId', async (c) => {
  const image = await findOwnedImage(c.env.DB, c.get('user').id, c.req.param('imageId'));
  if (!image) return jsonError(c, 404, 'Billedet findes ikke.', 'IMAGE_NOT_FOUND');
  const object = await c.env.MEDIA.get(image.r2_key);
  if (!object) return jsonError(c, 404, 'Billedfilen mangler.', 'IMAGE_OBJECT_NOT_FOUND');
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Content-Type', image.content_type);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('ETag', object.httpEtag);
  return new Response(object.body, { headers });
});
