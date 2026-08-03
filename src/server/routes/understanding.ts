import { Hono, type Context } from 'hono';
import {
  createAssessmentSchema,
  createObservationSchema,
  createPlantSchema,
  identifyPlantSchema,
  linkPlantMediaSchema,
  mergePlantsSchema,
  suggestionDecisionSchema,
  updatePlantSchema,
  updateWalkSchema,
} from '../../shared/schemas';
import { gardenBelongsToUser } from '../repositories/gardens';
import {
  archiveObservation,
  archivePlant,
  completeIdentification,
  createAssessment,
  createIdentificationRequest,
  createObservation,
  createPlant,
  decideSuggestion,
  failIdentification,
  getGardenUnderstanding,
  getPlantMediaForIdentification,
  linkPlantMedia,
  mergePlants,
  startWalk,
  updatePlant,
  updateWalk,
} from '../repositories/understanding';
import { configuredGardenDataSources } from '../providers/garden-data';
import { PlantNetProvider } from '../providers/plant-identification';
import { requireAuth } from '../middleware/auth';
import type { AppEnvironment } from '../types';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

export const understandingRoutes = new Hono<AppEnvironment>();
understandingRoutes.use('*', requireAuth);

async function ownsGarden(c: Context<AppEnvironment>): Promise<boolean> {
  return gardenBelongsToUser(c.env.DB, c.get('user').id, c.req.param('gardenId'));
}

understandingRoutes.get('/:gardenId/understanding', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const understanding = await getGardenUnderstanding(c.env.DB, gardenId, {
    plantIdentificationAvailable: Boolean(c.env.PLANTNET_API_KEY),
    dataSources: configuredGardenDataSources(),
  });
  return c.json({ understanding });
});

understandingRoutes.post('/:gardenId/walks', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  return c.json({ walk: await startWalk(c.env.DB, gardenId) }, 201);
});

understandingRoutes.patch('/:gardenId/walks/:walkId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = updateWalkSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Havevandringen kunne ikke opdateres.', 'INVALID_WALK', parsed.error.flatten());
  const walk = await updateWalk(c.env.DB, gardenId, c.req.param('walkId'), parsed.data);
  if (!walk) return jsonError(c, 404, 'Havevandringen blev ikke fundet.', 'WALK_NOT_FOUND');
  return c.json({ walk });
});

understandingRoutes.post('/:gardenId/observations', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = createObservationSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Observationen er ikke gyldig.', 'INVALID_OBSERVATION', parsed.error.flatten());
  return c.json({ observation: await createObservation(c.env.DB, gardenId, parsed.data) }, 201);
});

understandingRoutes.delete('/:gardenId/observations/:observationId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  if (!(await archiveObservation(c.env.DB, gardenId, c.req.param('observationId')))) {
    return jsonError(c, 404, 'Observationen blev ikke fundet.', 'OBSERVATION_NOT_FOUND');
  }
  return c.json({ ok: true });
});

understandingRoutes.post('/:gardenId/plants', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = createPlantSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Planten er ikke gyldig.', 'INVALID_PLANT', parsed.error.flatten());
  return c.json({ plant: await createPlant(c.env.DB, gardenId, parsed.data) }, 201);
});

understandingRoutes.patch('/:gardenId/plants/:plantId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = updatePlantSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Planten er ikke gyldig.', 'INVALID_PLANT', parsed.error.flatten());
  if (!(await updatePlant(c.env.DB, gardenId, c.req.param('plantId'), parsed.data))) {
    return jsonError(c, 404, 'Planten blev ikke fundet.', 'PLANT_NOT_FOUND');
  }
  return c.json({ ok: true });
});

understandingRoutes.delete('/:gardenId/plants/:plantId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  if (!(await archivePlant(c.env.DB, gardenId, c.req.param('plantId')))) {
    return jsonError(c, 404, 'Planten blev ikke fundet.', 'PLANT_NOT_FOUND');
  }
  return c.json({ ok: true });
});

understandingRoutes.post('/:gardenId/plants/:plantId/media', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = linkPlantMediaSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Billedkoblingen er ikke gyldig.', 'INVALID_PLANT_MEDIA', parsed.error.flatten());
  if (!(await linkPlantMedia(c.env.DB, gardenId, c.req.param('plantId'), parsed.data.mediaId, parsed.data.organ))) {
    return jsonError(c, 404, 'Planten eller billedet blev ikke fundet.', 'PLANT_MEDIA_NOT_FOUND');
  }
  return c.json({ ok: true }, 201);
});

understandingRoutes.post('/:gardenId/plants/:plantId/identify', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  if (!c.env.PLANTNET_API_KEY) {
    return jsonError(c, 409, 'Plantegenkendelse er ikke aktiveret. Manuel registrering virker stadig.', 'PLANT_ID_UNAVAILABLE');
  }
  const raw = await parseJson<unknown>(c).catch(() => ({}));
  const parsed = identifyPlantSchema.safeParse(raw ?? {});
  if (!parsed.success) return jsonError(c, 422, 'Vælg mellem ét og fem billeder.', 'INVALID_IDENTIFICATION', parsed.error.flatten());
  const plantId = c.req.param('plantId');
  const media = await getPlantMediaForIdentification(c.env.DB, c.get('user').id, gardenId, plantId, parsed.data.mediaIds);
  if (media.length === 0) return jsonError(c, 422, 'Tilføj mindst ét billede til planten først.', 'PLANT_IMAGE_REQUIRED');
  const requestId = await createIdentificationRequest(c.env.DB, gardenId, plantId, 'plantnet');
  try {
    const images = [];
    for (const item of media) {
      const object = await c.env.MEDIA.get(item.r2Key);
      if (!object) continue;
      images.push({ blob: await object.blob(), filename: item.originalFilename, organ: item.organ });
    }
    if (images.length === 0) throw new Error('Billedfilerne kunne ikke hentes.');
    const provider = new PlantNetProvider(c.env.PLANTNET_API_KEY, c.env.PLANTNET_PROJECT || 'all');
    const suggestions = await provider.identify(images);
    await completeIdentification(c.env.DB, requestId, suggestions);
    return c.json({ requestId, suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plantegenkendelsen mislykkedes.';
    await failIdentification(c.env.DB, requestId, message);
    return jsonError(c, 503, 'Plantegenkendelsen kunne ikke gennemføres lige nu.', 'PLANT_ID_FAILED');
  }
});

understandingRoutes.post('/:gardenId/suggestions/:suggestionId/decision', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = suggestionDecisionSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Valget er ikke gyldigt.', 'INVALID_DECISION');
  if (!(await decideSuggestion(c.env.DB, gardenId, c.req.param('suggestionId'), parsed.data.action))) {
    return jsonError(c, 404, 'Forslaget blev ikke fundet.', 'SUGGESTION_NOT_FOUND');
  }
  return c.json({ ok: true });
});

understandingRoutes.post('/:gardenId/plants/:plantId/merge', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = mergePlantsSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Planterne kunne ikke sammenlægges.', 'INVALID_MERGE');
  if (!(await mergePlants(c.env.DB, gardenId, c.req.param('plantId'), parsed.data.duplicatePlantId))) {
    return jsonError(c, 404, 'Begge planter skal findes i samme have.', 'PLANT_NOT_FOUND');
  }
  return c.json({ ok: true });
});

understandingRoutes.post('/:gardenId/assessments', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = createAssessmentSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Haveforholdet er ikke gyldigt.', 'INVALID_ASSESSMENT', parsed.error.flatten());
  return c.json({ assessment: await createAssessment(c.env.DB, gardenId, parsed.data) }, 201);
});
