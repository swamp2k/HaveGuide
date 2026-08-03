import { Hono, type Context } from 'hono';
import {
  createChangeSchema,
  createShoppingItemSchema,
  createTaskSchema,
  updateShoppingItemSchema,
  updateTaskSchema,
} from '../../shared/journey-schemas';
import { requireAuth } from '../middleware/auth';
import { getCaptureWorkspace } from '../repositories/capture';
import { gardenBelongsToUser } from '../repositories/gardens';
import {
  createChange,
  createShoppingItem,
  createTask,
  getJourney,
  updateShoppingItem,
  updateTask,
} from '../repositories/journey';
import type { AppEnvironment } from '../types';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

export const journeyRoutes = new Hono<AppEnvironment>();
journeyRoutes.use('*', requireAuth);

async function requireGarden(c: Context<AppEnvironment>, gardenId: string): Promise<boolean> {
  return gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId);
}

journeyRoutes.get('/:gardenId/journey', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await requireGarden(c, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  return c.json({ journey: await getJourney(c.env.DB, gardenId) });
});

journeyRoutes.post('/:gardenId/tasks', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await requireGarden(c, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = createTaskSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Opgaven er ikke gyldig.', 'INVALID_TASK', parsed.error.flatten());
  await createTask(c.env.DB, gardenId, parsed.data);
  return c.json({ journey: await getJourney(c.env.DB, gardenId) }, 201);
});

journeyRoutes.patch('/:gardenId/tasks/:taskId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await requireGarden(c, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = updateTaskSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Opgaven er ikke gyldig.', 'INVALID_TASK');
  if (!(await updateTask(c.env.DB, gardenId, c.req.param('taskId'), parsed.data))) return jsonError(c, 404, 'Opgaven blev ikke fundet.', 'TASK_NOT_FOUND');
  return c.json({ journey: await getJourney(c.env.DB, gardenId) });
});

journeyRoutes.post('/:gardenId/changes', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await requireGarden(c, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = createChangeSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Ændringen er ikke gyldig.', 'INVALID_CHANGE', parsed.error.flatten());
  await createChange(c.env.DB, gardenId, parsed.data);
  return c.json({ journey: await getJourney(c.env.DB, gardenId) }, 201);
});

journeyRoutes.post('/:gardenId/shopping', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await requireGarden(c, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = createShoppingItemSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Indkøbet er ikke gyldigt.', 'INVALID_SHOPPING_ITEM', parsed.error.flatten());
  await createShoppingItem(c.env.DB, gardenId, parsed.data);
  return c.json({ journey: await getJourney(c.env.DB, gardenId) }, 201);
});

journeyRoutes.patch('/:gardenId/shopping/:itemId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await requireGarden(c, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = updateShoppingItemSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Indkøbet er ikke gyldigt.', 'INVALID_SHOPPING_ITEM');
  if (!(await updateShoppingItem(c.env.DB, gardenId, c.req.param('itemId'), parsed.data))) return jsonError(c, 404, 'Indkøbet blev ikke fundet.', 'SHOPPING_ITEM_NOT_FOUND');
  return c.json({ journey: await getJourney(c.env.DB, gardenId) });
});

journeyRoutes.get('/:gardenId/export', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await requireGarden(c, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const [garden, journey, capture] = await Promise.all([
    c.env.DB.prepare('SELECT id,name,address,notes,center_lat,center_lng,created_at,updated_at FROM gardens WHERE id=?').bind(gardenId).first(),
    getJourney(c.env.DB, gardenId),
    getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  ]);
  return new Response(JSON.stringify({
    exportedAt: new Date().toISOString(),
    garden,
    journey,
    capture,
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="have-guide-${gardenId}.json"`,
    },
  });
});
