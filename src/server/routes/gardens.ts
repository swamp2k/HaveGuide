import { Hono } from 'hono';
import { createFeatureSchema, createGardenSchema, updateFeatureSchema, updateGardenSchema } from '../../shared/schemas';
import type { AppEnvironment } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  createGarden,
  gardenBelongsToUser,
  getGarden,
  listGardens,
  updateGarden,
} from '../repositories/gardens';
import { archiveFeature, createFeature, getFeature, updateFeature } from '../repositories/features';
import { jsonError } from '../utils/response';
import { parseJson } from '../utils/request';

export const gardenRoutes = new Hono<AppEnvironment>();
gardenRoutes.use('*', requireAuth);

gardenRoutes.get('/', async (c) => {
  const gardens = await listGardens(c.env.DB, c.get('user').id);
  return c.json({ gardens });
});

gardenRoutes.post('/', async (c) => {
  const raw = await parseJson<unknown>(c);
  const parsed = createGardenSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 422, 'Kontrollér havens oplysninger.', 'INVALID_INPUT', parsed.error.flatten());
  const garden = await createGarden(c.env.DB, c.get('user').id, parsed.data);
  return c.json({ garden }, 201);
});

gardenRoutes.get('/:gardenId', async (c) => {
  const garden = await getGarden(c.env.DB, c.get('user').id, c.req.param('gardenId'));
  if (!garden) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  return c.json({ garden });
});

gardenRoutes.patch('/:gardenId', async (c) => {
  const raw = await parseJson<unknown>(c);
  const parsed = updateGardenSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 422, 'Kontrollér havens oplysninger.', 'INVALID_INPUT', parsed.error.flatten());
  const garden = await updateGarden(c.env.DB, c.get('user').id, c.req.param('gardenId'), parsed.data);
  if (!garden) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  return c.json({ garden });
});

gardenRoutes.post('/:gardenId/features', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const raw = await parseJson<unknown>(c);
  const parsed = createFeatureSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 422, 'Kortobjektet er ikke gyldigt.', 'INVALID_FEATURE', parsed.error.flatten());
  const feature = await createFeature(c.env.DB, gardenId, parsed.data);
  return c.json({ feature }, 201);
});

gardenRoutes.patch('/:gardenId/features/:featureId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const feature = await getFeature(c.env.DB, c.req.param('featureId'));
  if (!feature || feature.gardenId !== gardenId) {
    return jsonError(c, 404, 'Kortobjektet blev ikke fundet.', 'FEATURE_NOT_FOUND');
  }
  const raw = await parseJson<unknown>(c);
  const parsed = updateFeatureSchema.safeParse(raw);
  if (!parsed.success) return jsonError(c, 422, 'Kortobjektet er ikke gyldigt.', 'INVALID_FEATURE', parsed.error.flatten());
  const updated = await updateFeature(c.env.DB, feature.id, parsed.data);
  return c.json({ feature: updated });
});

gardenRoutes.delete('/:gardenId/features/:featureId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const feature = await getFeature(c.env.DB, c.req.param('featureId'));
  if (!feature || feature.gardenId !== gardenId) {
    return jsonError(c, 404, 'Kortobjektet blev ikke fundet.', 'FEATURE_NOT_FOUND');
  }
  await archiveFeature(c.env.DB, feature.id);
  return c.json({ ok: true });
});
