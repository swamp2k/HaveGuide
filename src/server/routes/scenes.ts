import { Hono } from 'hono';
import { isProfileComplete } from '../../shared/profile';
import {
  analyzeSceneSchema,
  areaProfileSchema,
  identificationRescanSchema,
  identificationUpdateSchema,
  identifyPlantSchema,
  sceneCreateSchema,
  sceneUpdateSchema,
} from '../../shared/schemas';
import type { AppEnvironment } from '../types';
import { AnthropicGardenProvider } from '../providers/anthropic';
import { PlantNetProvider } from '../providers/plantnet';
import {
  addImage,
  createScene,
  deleteIdentification,
  deletePlantImage,
  deleteScene,
  findIdentification,
  findOwnedImage,
  getProfile,
  getScene,
  listIdentifications,
  listScenes,
  ownedScene,
  replaceIdentificationScan,
  saveAnalysis,
  saveIdentification,
  saveProfile,
  updateIdentification,
  updateScene,
} from '../repositories/scenes';
import { requireAuth } from '../middleware/auth';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

export const sceneRoutes = new Hono<AppEnvironment>();
sceneRoutes.use('*', requireAuth);

sceneRoutes.get('/', async (c) => c.json({ scenes: await listScenes(c.env.DB, c.get('user').id) }));

sceneRoutes.post('/', async (c) => {
  const parsed = sceneCreateSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Navngiv området.', 'INVALID_INPUT', parsed.error.flatten());
  const id = await createScene(c.env.DB, c.get('user').id, parsed.data);
  return c.json({ scene: await getScene(c.env.DB, c.get('user').id, id) }, 201);
});

sceneRoutes.get('/:sceneId', async (c) => {
  const scene = await getScene(c.env.DB, c.get('user').id, c.req.param('sceneId'));
  if (!scene) return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  return c.json({ scene });
});

sceneRoutes.patch('/:sceneId', async (c) => {
  const parsed = sceneUpdateSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Ændringen er ikke gyldig.', 'INVALID_INPUT');
  const ok = await updateScene(c.env.DB, c.get('user').id, c.req.param('sceneId'), parsed.data);
  if (!ok) return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  return c.json({ scene: await getScene(c.env.DB, c.get('user').id, c.req.param('sceneId')) });
});

sceneRoutes.put('/:sceneId/profile', async (c) => {
  const sceneId = c.req.param('sceneId');
  if (!(await ownedScene(c.env.DB, c.get('user').id, sceneId))) {
    return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  }
  const parsed = areaProfileSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Områdeforholdene er ikke gyldige.', 'INVALID_PROFILE', parsed.error.flatten());
  await saveProfile(c.env.DB, sceneId, parsed.data);
  return c.json({ profile: parsed.data, profileComplete: isProfileComplete(parsed.data) });
});

sceneRoutes.post('/:sceneId/images', async (c) => {
  const userId = c.get('user').id;
  const sceneId = c.req.param('sceneId');
  if (!(await ownedScene(c.env.DB, userId, sceneId))) {
    return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  }

  const form = await c.req.formData();
  const value = form.get('image');
  const kindValue = form.get('kind');
  const kind = kindValue === 'plant' ? 'plant' : 'scene';
  if (!(value instanceof File)) return jsonError(c, 422, 'Vælg et billede.', 'IMAGE_REQUIRED');

  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  if (!allowedTypes.has(value.type)) {
    return jsonError(c, 422, 'Brug JPEG, PNG eller WebP.', 'UNSUPPORTED_IMAGE_TYPE');
  }
  const maxUploadMb = Math.min(Math.max(Number(c.env.MAX_UPLOAD_MB || 12), 1), 25);
  if (value.size > maxUploadMb * 1024 * 1024) {
    return jsonError(c, 413, `Billedet må højst fylde ${maxUploadMb} MB.`, 'IMAGE_TOO_LARGE');
  }

  const r2Key = `users/${userId}/scenes/${sceneId}/${crypto.randomUUID()}.${value.type.split('/')[1] || 'jpg'}`;
  await c.env.MEDIA.put(r2Key, value.stream(), {
    httpMetadata: { contentType: value.type },
    customMetadata: { originalFilename: value.name, kind },
  });
  const imageId = await addImage(c.env.DB, userId, sceneId, {
    kind,
    r2Key,
    filename: value.name || `${kind}.jpg`,
    contentType: value.type,
    sizeBytes: value.size,
  });
  return c.json({ scene: await getScene(c.env.DB, userId, sceneId), imageId }, 201);
});

sceneRoutes.post('/:sceneId/identify', async (c) => {
  const userId = c.get('user').id;
  const sceneId = c.req.param('sceneId');
  if (!(await ownedScene(c.env.DB, userId, sceneId))) {
    return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  }
  const parsed = identifyPlantSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Vælg et plantefoto.', 'INVALID_INPUT');
  if (!c.env.PLANTNET_API_KEY) return jsonError(c, 503, 'PlantNet er ikke konfigureret.', 'PLANTNET_NOT_CONFIGURED');

  const image = await findOwnedImage(c.env.DB, userId, parsed.data.imageId);
  if (!image || image.scene_id !== sceneId) return jsonError(c, 404, 'Billedet findes ikke.', 'IMAGE_NOT_FOUND');
  const object = await c.env.MEDIA.get(image.r2_key);
  if (!object) return jsonError(c, 404, 'Billedfilen mangler.', 'IMAGE_OBJECT_NOT_FOUND');

  try {
    const suggestions = await new PlantNetProvider(c.env.PLANTNET_API_KEY, c.env.PLANTNET_PROJECT || 'all').identify({
      blob: await object.blob(),
      filename: image.original_filename,
      organ: parsed.data.organ,
    });
    const id = await saveIdentification(c.env.DB, sceneId, image.id, parsed.data.organ, suggestions, {
      nickname: parsed.data.nickname,
      note: parsed.data.note,
    });
    const identification = await findIdentification(c.env.DB, sceneId, id);
    return c.json({ id, suggestions, identification });
  } catch (error) {
    console.error('PlantNet identify failed', error);
    return jsonError(c, 502, 'PlantNet kunne ikke analysere billedet lige nu.', 'PLANTNET_FAILED');
  }
});

sceneRoutes.post('/:sceneId/analyze', async (c) => {
  const userId = c.get('user').id;
  const sceneId = c.req.param('sceneId');
  if (!(await ownedScene(c.env.DB, userId, sceneId))) {
    return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  }
  const parsed = analyzeSceneSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Analysen kunne ikke startes.', 'INVALID_INPUT');
  if (!c.env.ANTHROPIC_API_KEY) return jsonError(c, 503, 'AI-analyse er ikke konfigureret.', 'AI_NOT_CONFIGURED');

  const image = await findOwnedImage(c.env.DB, userId, parsed.data.imageId);
  if (!image || image.scene_id !== sceneId) return jsonError(c, 404, 'Billedet findes ikke.', 'IMAGE_NOT_FOUND');
  if (image.size_bytes > 8 * 1024 * 1024) {
    return jsonError(c, 413, 'Billedet er for stort til AI-analyse. Upload en komprimeret version.', 'AI_IMAGE_TOO_LARGE');
  }

  const profile = await getProfile(c.env.DB, sceneId);
  if (parsed.data.mode === 'ideas' && !isProfileComplete(profile)) {
    return jsonError(
      c,
      422,
      'Vælg sol, fugt, jord og dræn først.',
      'PROFILE_REQUIRED',
    );
  }

  const object = await c.env.MEDIA.get(image.r2_key);
  if (!object) return jsonError(c, 404, 'Billedfilen mangler.', 'IMAGE_OBJECT_NOT_FOUND');

  try {
    const provider = new AnthropicGardenProvider(c.env.ANTHROPIC_API_KEY, c.env.ANTHROPIC_MODEL || 'claude-sonnet-5');
    const payload = await provider.analyze({
      image: { bytes: await object.arrayBuffer(), contentType: image.content_type },
      profile,
      mode: parsed.data.mode,
      question: parsed.data.question,
      identifications: await listIdentifications(c.env.DB, sceneId),
    });
    const id = await saveAnalysis(c.env.DB, {
      sceneId,
      imageId: image.id,
      mode: parsed.data.mode,
      model: provider.model,
      question: parsed.data.question,
      payload,
    });
    return c.json({
      analysis: {
        id,
        sceneId,
        imageId: image.id,
        mode: parsed.data.mode,
        model: provider.model,
        createdAt: new Date().toISOString(),
        payload,
      },
    });
  } catch (error) {
    console.error('Anthropic analysis failed', error);
    return jsonError(c, 502, 'AI-analysen fejlede. Prøv igen om lidt.', 'AI_ANALYSIS_FAILED');
  }
});

sceneRoutes.patch('/:sceneId/identifications/:identificationId', async (c) => {
  const userId = c.get('user').id;
  const sceneId = c.req.param('sceneId');
  if (!(await ownedScene(c.env.DB, userId, sceneId))) {
    return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  }
  const parsed = identificationUpdateSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Ændringen er ikke gyldig.', 'INVALID_INPUT');

  const identification = await updateIdentification(
    c.env.DB,
    sceneId,
    c.req.param('identificationId'),
    parsed.data,
  );
  if (!identification) return jsonError(c, 404, 'Planten findes ikke.', 'IDENTIFICATION_NOT_FOUND');
  return c.json({ identification });
});

sceneRoutes.post('/:sceneId/identifications/:identificationId/rescan', async (c) => {
  const userId = c.get('user').id;
  const sceneId = c.req.param('sceneId');
  const identificationId = c.req.param('identificationId');
  if (!(await ownedScene(c.env.DB, userId, sceneId))) {
    return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  }
  const parsed = identificationRescanSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Vælg et plantefoto.', 'INVALID_INPUT');
  if (!c.env.PLANTNET_API_KEY) return jsonError(c, 503, 'Planteopslag er ikke klar.', 'PLANTNET_NOT_CONFIGURED');

  const existing = await findIdentification(c.env.DB, sceneId, identificationId);
  if (!existing) return jsonError(c, 404, 'Planten findes ikke.', 'IDENTIFICATION_NOT_FOUND');

  const image = await findOwnedImage(c.env.DB, userId, parsed.data.imageId);
  if (!image || image.scene_id !== sceneId || image.kind !== 'plant') {
    return jsonError(c, 404, 'Billedet findes ikke.', 'IMAGE_NOT_FOUND');
  }
  const object = await c.env.MEDIA.get(image.r2_key);
  if (!object) return jsonError(c, 404, 'Billedfilen mangler.', 'IMAGE_OBJECT_NOT_FOUND');

  try {
    const suggestions = await new PlantNetProvider(c.env.PLANTNET_API_KEY, c.env.PLANTNET_PROJECT || 'all').identify({
      blob: await object.blob(),
      filename: image.original_filename,
      organ: parsed.data.organ,
    });
    const { identification, previousImageId } = await replaceIdentificationScan(c.env.DB, sceneId, identificationId, {
      imageId: image.id,
      organ: parsed.data.organ,
      suggestions,
    });
    if (!identification) return jsonError(c, 404, 'Planten findes ikke.', 'IDENTIFICATION_NOT_FOUND');
    if (previousImageId && previousImageId !== image.id) {
      const staleKey = await deletePlantImage(c.env.DB, sceneId, previousImageId);
      if (staleKey) c.executionCtx.waitUntil(c.env.MEDIA.delete(staleKey));
    }
    return c.json({ identification });
  } catch (error) {
    console.error('PlantNet rescan failed', error);
    return jsonError(c, 502, 'Planten kunne ikke slås op lige nu.', 'PLANTNET_FAILED');
  }
});

sceneRoutes.delete('/:sceneId/identifications/:identificationId', async (c) => {
  const userId = c.get('user').id;
  const sceneId = c.req.param('sceneId');
  if (!(await ownedScene(c.env.DB, userId, sceneId))) {
    return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  }
  const result = await deleteIdentification(c.env.DB, sceneId, c.req.param('identificationId'));
  if (!result) return jsonError(c, 404, 'Planten findes ikke.', 'IDENTIFICATION_NOT_FOUND');
  if (result.r2Key) c.executionCtx.waitUntil(c.env.MEDIA.delete(result.r2Key));
  return c.json({ ok: true });
});

sceneRoutes.delete('/:sceneId', async (c) => {
  const keys = await deleteScene(c.env.DB, c.get('user').id, c.req.param('sceneId'));
  if (!keys) return jsonError(c, 404, 'Området findes ikke.', 'SCENE_NOT_FOUND');
  c.executionCtx.waitUntil(Promise.all(keys.map((key) => c.env.MEDIA.delete(key))).then(() => undefined));
  return c.json({ ok: true });
});
