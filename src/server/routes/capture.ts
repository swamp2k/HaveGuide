import { Hono } from 'hono';
import {
  createCaptureFrameSchema,
  createCaptureSessionSchema,
  updateCaptureSessionSchema,
} from '../../shared/capture-schemas';
import { requireAuth } from '../middleware/auth';
import {
  addCaptureFrame,
  createCaptureSession,
  finishCaptureSession,
  getCaptureWorkspace,
  mediaBelongsToGarden,
} from '../repositories/capture';
import { featureBelongsToGarden, gardenBelongsToUser } from '../repositories/gardens';
import type { AppEnvironment } from '../types';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

export const captureRoutes = new Hono<AppEnvironment>();
captureRoutes.use('*', requireAuth);

captureRoutes.get('/:gardenId/capture', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  return c.json({
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  });
});

captureRoutes.post('/:gardenId/capture/sessions', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const parsed = createCaptureSessionSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) {
    return jsonError(c, 422, 'Billedturens oplysninger er ikke gyldige.', 'INVALID_CAPTURE_SESSION', parsed.error.flatten());
  }
  if (
    parsed.data.targetFeatureId &&
    !(await featureBelongsToGarden(c.env.DB, parsed.data.targetFeatureId, gardenId))
  ) {
    return jsonError(c, 404, 'Det valgte haveområde blev ikke fundet.', 'FEATURE_NOT_FOUND');
  }
  const sessionId = await createCaptureSession(c.env.DB, gardenId, parsed.data);
  return c.json({
    sessionId,
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  }, 201);
});

captureRoutes.post('/:gardenId/capture/sessions/:sessionId/frames', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const parsed = createCaptureFrameSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) {
    return jsonError(c, 422, 'Billedets oplysninger er ikke gyldige.', 'INVALID_CAPTURE_FRAME', parsed.error.flatten());
  }
  if (!(await mediaBelongsToGarden(c.env.DB, c.get('user').id, gardenId, parsed.data.mediaId))) {
    return jsonError(c, 404, 'Billedet blev ikke fundet i denne have.', 'MEDIA_NOT_FOUND');
  }
  const saved = await addCaptureFrame(
    c.env.DB,
    gardenId,
    c.req.param('sessionId'),
    parsed.data,
  );
  if (!saved) {
    return jsonError(c, 404, 'Den aktive billedtur blev ikke fundet.', 'CAPTURE_SESSION_NOT_FOUND');
  }
  return c.json({
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  }, 201);
});

captureRoutes.patch('/:gardenId/capture/sessions/:sessionId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const parsed = updateCaptureSessionSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) {
    return jsonError(c, 422, 'Billedturens status er ikke gyldig.', 'INVALID_CAPTURE_STATUS');
  }
  const changed = await finishCaptureSession(
    c.env.DB,
    gardenId,
    c.req.param('sessionId'),
    parsed.data.status,
  );
  if (!changed) {
    return jsonError(c, 404, 'Den aktive billedtur blev ikke fundet.', 'CAPTURE_SESSION_NOT_FOUND');
  }
  return c.json({
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  });
});
