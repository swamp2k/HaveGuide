import { Hono } from 'hono';
import { mediaMetadataSchema } from '../../shared/schemas';
import type { AppEnvironment } from '../types';
import { requireAuth } from '../middleware/auth';
import { featureBelongsToGarden, gardenBelongsToUser } from '../repositories/gardens';
import { createMediaRecord, deleteMediaRecord, getMediaForUser, listMedia } from '../repositories/media';
import { jsonError } from '../utils/response';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

function optionalNumber(value: FormDataEntryValue | null): number | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const mediaRoutes = new Hono<AppEnvironment>();
mediaRoutes.use('*', requireAuth);

mediaRoutes.get('/', async (c) => {
  const gardenId = c.req.query('gardenId');
  if (gardenId && !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const media = await listMedia(c.env.DB, c.get('user').id, gardenId);
  return c.json({ media });
});

mediaRoutes.post('/', async (c) => {
  const maxBytes = Math.min(Math.max(Number.parseInt(c.env.MAX_UPLOAD_MB || '12', 10), 1), 25) * 1024 * 1024;
  const contentLength = Number.parseInt(c.req.header('Content-Length') ?? '0', 10);
  if (contentLength > maxBytes + 1024 * 128) {
    return jsonError(c, 413, 'Billedet er for stort.', 'UPLOAD_TOO_LARGE');
  }

  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return jsonError(c, 422, 'Billedet kunne ikke læses.', 'INVALID_MULTIPART');
  }

  const file = form.get('file');
  if (!(file instanceof File)) return jsonError(c, 422, 'Vælg et billede.', 'FILE_REQUIRED');
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return jsonError(c, 415, 'Billedtypen understøttes ikke.', 'UNSUPPORTED_MEDIA_TYPE');
  }
  if (file.size > maxBytes) return jsonError(c, 413, 'Billedet er for stort.', 'UPLOAD_TOO_LARGE');

  const metadataResult = mediaMetadataSchema.safeParse({
    gardenId: form.get('gardenId'),
    featureId: typeof form.get('featureId') === 'string' && form.get('featureId') ? form.get('featureId') : undefined,
    note: typeof form.get('note') === 'string' ? form.get('note') : '',
    latitude: optionalNumber(form.get('latitude')),
    longitude: optionalNumber(form.get('longitude')),
  });
  if (!metadataResult.success) {
    return jsonError(c, 422, 'Billedets oplysninger er ikke gyldige.', 'INVALID_MEDIA_METADATA', metadataResult.error.flatten());
  }

  const { gardenId, featureId, note, latitude, longitude } = metadataResult.data;
  if (!(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  if (featureId && !(await featureBelongsToGarden(c.env.DB, featureId, gardenId))) {
    return jsonError(c, 404, 'Kortobjektet blev ikke fundet.', 'FEATURE_NOT_FOUND');
  }

  const extension = file.name.includes('.') ? file.name.split('.').at(-1)?.toLowerCase() : undefined;
  const r2Key = `${c.get('user').id}/${gardenId}/${crypto.randomUUID()}${extension ? `.${extension}` : ''}`;
  await c.env.MEDIA.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { originalFilename: file.name },
  });

  try {
    const media = await createMediaRecord(c.env.DB, {
      userId: c.get('user').id,
      gardenId,
      featureId: featureId ?? null,
      r2Key,
      originalFilename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      note,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
    });
    return c.json({ media }, 201);
  } catch (error) {
    await c.env.MEDIA.delete(r2Key);
    throw error;
  }
});

mediaRoutes.get('/:mediaId/content', async (c) => {
  const row = await getMediaForUser(c.env.DB, c.get('user').id, c.req.param('mediaId'));
  if (!row) return jsonError(c, 404, 'Billedet blev ikke fundet.', 'MEDIA_NOT_FOUND');
  const object = await c.env.MEDIA.get(row.r2_key);
  if (!object) return jsonError(c, 404, 'Billedfilen mangler.', 'MEDIA_OBJECT_MISSING');

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.original_filename)}`);
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(object.body, { headers });
});

mediaRoutes.delete('/:mediaId', async (c) => {
  const result = await deleteMediaRecord(c.env.DB, c.get('user').id, c.req.param('mediaId'));
  if (!result.deleted || !result.r2Key) return jsonError(c, 404, 'Billedet blev ikke fundet.', 'MEDIA_NOT_FOUND');
  await c.env.MEDIA.delete(result.r2Key);
  return c.json({ ok: true });
});
