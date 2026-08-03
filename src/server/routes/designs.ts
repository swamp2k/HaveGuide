import { Hono } from 'hono';
import {
  createDesignProjectSchema,
  selectDesignOptionSchema,
  updateDesignVisualSchema,
} from '../../shared/schemas';
import { requireAuth } from '../middleware/auth';
import {
  archiveDesignProject,
  createDesignProject,
  getDesignWorkspace,
  selectDesignOption,
  updateDesignVisual,
} from '../repositories/designs';
import { featureBelongsToGarden, gardenBelongsToUser } from '../repositories/gardens';
import type { AppEnvironment } from '../types';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

export const designRoutes = new Hono<AppEnvironment>();
designRoutes.use('*', requireAuth);

async function mediaBelongsToGarden(
  db: D1Database,
  userId: string,
  gardenId: string,
  mediaId: string,
): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM media m JOIN media_links ml ON ml.media_id = m.id
    WHERE m.id = ? AND m.user_id = ? AND ml.garden_id = ? AND m.deleted_at IS NULL LIMIT 1`)
    .bind(mediaId, userId, gardenId).first<{ found: number }>();
  return row?.found === 1;
}

designRoutes.get('/:gardenId/design', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  return c.json({ workspace: await getDesignWorkspace(c.env.DB, gardenId) });
});

designRoutes.post('/:gardenId/design/projects', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const parsed = createDesignProjectSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) {
    return jsonError(c, 422, 'Planens oplysninger er ikke gyldige.', 'INVALID_DESIGN_PROJECT', parsed.error.flatten());
  }
  if (parsed.data.targetFeatureId && !(await featureBelongsToGarden(c.env.DB, parsed.data.targetFeatureId, gardenId))) {
    return jsonError(c, 404, 'Det valgte haveområde blev ikke fundet.', 'FEATURE_NOT_FOUND');
  }
  const inspirationMediaId = parsed.data.inspiration?.mediaId;
  if (inspirationMediaId && !(await mediaBelongsToGarden(c.env.DB, c.get('user').id, gardenId, inspirationMediaId))) {
    return jsonError(c, 404, 'Inspirationsbilledet blev ikke fundet.', 'MEDIA_NOT_FOUND');
  }
  const workspace = await createDesignProject(c.env.DB, gardenId, parsed.data);
  return c.json({ workspace }, 201);
});

designRoutes.post('/:gardenId/design/projects/:projectId/select', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const parsed = selectDesignOptionSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Vælg et gyldigt forslag.', 'INVALID_DESIGN_SELECTION');
  if (!(await selectDesignOption(c.env.DB, gardenId, c.req.param('projectId'), parsed.data.optionId))) {
    return jsonError(c, 404, 'Forslaget blev ikke fundet.', 'DESIGN_OPTION_NOT_FOUND');
  }
  return c.json({ workspace: await getDesignWorkspace(c.env.DB, gardenId) });
});

designRoutes.patch('/:gardenId/design/options/:optionId/visual', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const parsed = updateDesignVisualSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Visualiseringens oplysninger er ikke gyldige.', 'INVALID_VISUAL');
  if (parsed.data.backgroundMediaId && !(await mediaBelongsToGarden(c.env.DB, c.get('user').id, gardenId, parsed.data.backgroundMediaId))) {
    return jsonError(c, 404, 'Baggrundsbilledet blev ikke fundet.', 'MEDIA_NOT_FOUND');
  }
  if (!(await updateDesignVisual(c.env.DB, gardenId, c.req.param('optionId'), parsed.data.backgroundMediaId))) {
    return jsonError(c, 404, 'Forslaget blev ikke fundet.', 'DESIGN_OPTION_NOT_FOUND');
  }
  return c.json({ workspace: await getDesignWorkspace(c.env.DB, gardenId) });
});

designRoutes.delete('/:gardenId/design/projects/:projectId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  if (!(await archiveDesignProject(c.env.DB, gardenId, c.req.param('projectId')))) {
    return jsonError(c, 404, 'Planversionen blev ikke fundet.', 'DESIGN_PROJECT_NOT_FOUND');
  }
  return c.json({ workspace: await getDesignWorkspace(c.env.DB, gardenId) });
});
