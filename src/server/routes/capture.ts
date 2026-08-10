import { Hono } from 'hono';
import {
  createCaptureFrameSchema,
  createCaptureSessionSchema,
  updateCaptureSessionSchema,
  updateCaptureStationSchema,
  upsertCaptureHotspotSchema,
} from '../../shared/capture-schemas';
import { requireAuth } from '../middleware/auth';
import {
  addCaptureFrame,
  createCaptureSession,
  deleteCaptureHotspot,
  finishCaptureSession,
  getCaptureWorkspace,
  mediaBelongsToGarden,
  resetCaptureWorkspace,
  updateCaptureStationPosition,
  upsertCaptureHotspot,
} from '../repositories/capture';
import { featureBelongsToGarden, gardenBelongsToUser } from '../repositories/gardens';
import type { AppEnvironment } from '../types';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

export const captureRoutes = new Hono<AppEnvironment>();
captureRoutes.use('*', requireAuth);

async function gardenAvailable(c: Parameters<typeof gardenBelongsToUser>[0] extends never ? never : never) {
  return c;
}

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

captureRoutes.patch('/:gardenId/capture/sessions/:sessionId/stations/:stationNo', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const stationNo = Number.parseInt(c.req.param('stationNo'), 10);
  if (!Number.isInteger(stationNo) || stationNo < 1) {
    return jsonError(c, 422, 'Stationsnummeret er ikke gyldigt.', 'INVALID_CAPTURE_STATION');
  }
  const parsed = updateCaptureStationSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) {
    return jsonError(c, 422, 'Stationens placering er ikke gyldig.', 'INVALID_CAPTURE_STATION', parsed.error.flatten());
  }
  const changed = await updateCaptureStationPosition(
    c.env.DB,
    gardenId,
    c.req.param('sessionId'),
    stationNo,
    parsed.data.latitude,
    parsed.data.longitude,
  );
  if (!changed) {
    return jsonError(c, 404, 'Stationen blev ikke fundet.', 'CAPTURE_STATION_NOT_FOUND');
  }
  return c.json({
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  });
});

captureRoutes.put('/:gardenId/capture/sessions/:sessionId/frames/:frameId/hotspots', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const parsed = upsertCaptureHotspotSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) {
    return jsonError(c, 422, 'Objektmarkeringen er ikke gyldig.', 'INVALID_CAPTURE_HOTSPOT', parsed.error.flatten());
  }
  if (!(await featureBelongsToGarden(c.env.DB, parsed.data.featureId, gardenId))) {
    return jsonError(c, 404, 'Kortobjektet blev ikke fundet.', 'FEATURE_NOT_FOUND');
  }
  const changed = await upsertCaptureHotspot(
    c.env.DB,
    gardenId,
    c.req.param('sessionId'),
    c.req.param('frameId'),
    parsed.data.featureId,
    parsed.data.xNorm,
    parsed.data.yNorm,
  );
  if (!changed) {
    return jsonError(c, 404, 'Billedet blev ikke fundet i rundturen.', 'CAPTURE_FRAME_NOT_FOUND');
  }
  return c.json({
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  });
});

captureRoutes.delete('/:gardenId/capture/sessions/:sessionId/frames/:frameId/hotspots/:featureId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const changed = await deleteCaptureHotspot(
    c.env.DB,
    gardenId,
    c.req.param('sessionId'),
    c.req.param('frameId'),
    c.req.param('featureId'),
  );
  if (!changed) {
    return jsonError(c, 404, 'Objektmarkeringen blev ikke fundet.', 'CAPTURE_HOTSPOT_NOT_FOUND');
  }
  return c.json({
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  });
});

captureRoutes.delete('/:gardenId/capture', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!gardenId || !(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }

  const reset = await resetCaptureWorkspace(c.env.DB, c.get('user').id, gardenId);
  for (let index = 0; index < reset.r2Keys.length; index += 1000) {
    const keys = reset.r2Keys.slice(index, index + 1000);
    if (keys.length > 0) await c.env.MEDIA.delete(keys);
  }

  return c.json({
    deletedImages: reset.deletedImages,
    workspace: await getCaptureWorkspace(c.env.DB, gardenId, Boolean(c.env.DATAFORDELER_API_KEY)),
  });
});
