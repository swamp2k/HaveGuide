import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { gardenBelongsToUser } from '../repositories/gardens';
import { requireAuth } from '../middleware/auth';
import type { AppEnvironment } from '../types';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

const visionCandidateSchema = z.object({
  clusterId: z.string().min(1).max(80),
  imageBase64: z.string().min(32).max(900_000),
  mimeType: z.enum(['image/jpeg', 'image/png']).default('image/jpeg'),
  semanticLabel: z.string().min(1).max(40),
  preliminaryType: z.string().min(1).max(40),
});

const classifySmartScanSchema = z.object({
  sessionId: z.string().min(1).max(100),
  candidates: z.array(visionCandidateSchema).min(1).max(16),
  force: z.boolean().optional().default(false),
});

const point2Schema = z.tuple([z.number().finite(), z.number().finite()]);
const point3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const spatialBoundsSchema = z.object({ min: point3Schema, max: point3Schema }).passthrough();
const draftFeatureSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string().min(1).max(40),
  confidence: z.number().min(0).max(1),
  reviewRequired: z.boolean(),
  samples: z.number().int().nonnegative(),
  centroid: point3Schema,
  bounds: spatialBoundsSchema,
  sourceClusterIds: z.array(z.string().min(1).max(80)).max(100),
  footprint: z.array(point2Schema).max(1000).optional(),
  layer: z.string().max(40).optional(),
}).passthrough();

const saveScanSessionSchema = z.object({
  sessionId: z.string().min(1).max(100),
  coordinateFrame: z.string().min(1).max(80),
  bounds: z.record(z.string(), z.unknown()).optional().default({}),
  draftFeatures: z.array(draftFeatureSchema).max(100),
});

const reviewFeatureSchema = z.object({
  decision: z.enum(['pending', 'accepted', 'rejected']),
  typeOverride: z.string().min(1).max(40).nullable().optional(),
  footprint: z.array(point2Schema).max(1000).nullable().optional(),
});

type VisionType =
  | 'tree'
  | 'bush'
  | 'hedge'
  | 'lawn'
  | 'bed'
  | 'path'
  | 'patio'
  | 'building'
  | 'fence'
  | 'play_equipment'
  | 'water'
  | 'terrain'
  | 'object'
  | 'vegetation'
  | 'structure'
  | 'unknown';

type SmartScanSessionRow = {
  id: string;
  garden_id: string;
  session_id: string;
  coordinate_frame: string;
  bounds_json: string;
  draft_features_json: string;
  review_status: 'draft' | 'reviewing' | 'reviewed';
  created_at: string;
  updated_at: string;
};

type SmartScanReviewRow = {
  feature_id: string;
  decision: 'pending' | 'accepted' | 'rejected';
  type_override: string | null;
  footprint_json: string | null;
  updated_at: string;
};

export const smartScanRoutes = new Hono<AppEnvironment>();
smartScanRoutes.use('*', requireAuth);

async function ownsGarden(c: Context<AppEnvironment>): Promise<boolean> {
  return gardenBelongsToUser(c.env.DB, c.get('user').id, c.req.param('gardenId'));
}

function decodeBase64(value: string): ArrayBuffer {
  const comma = value.indexOf(',');
  const encoded = comma >= 0 ? value.slice(comma + 1) : value;
  const binary = atob(encoded);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return buffer;
}

const keywordGroups: Array<{ type: VisionType; weight: number; terms: string[] }> = [
  { type: 'play_equipment', weight: 5, terms: ['trampoline', 'swing set', 'play structure', 'playhouse', 'play house', 'slide', 'climbing frame'] },
  { type: 'hedge', weight: 5, terms: ['hedge', 'hedgerow', 'privacy hedge'] },
  { type: 'bush', weight: 4, terms: ['bush', 'shrub', 'shrubs', 'shrubbery'] },
  { type: 'tree', weight: 4, terms: ['fruit tree', 'tree trunk', 'tree', 'canopy'] },
  { type: 'bed', weight: 4, terms: ['flower bed', 'garden bed', 'planting bed', 'planted bed', 'flowerbed', 'ornamental grass', 'flowering plants'] },
  { type: 'lawn', weight: 4, terms: ['lawn', 'turf', 'grassy lawn', 'grass area'] },
  { type: 'patio', weight: 5, terms: ['patio', 'terrace', 'wooden deck', 'decking'] },
  { type: 'path', weight: 4, terms: ['garden path', 'walkway', 'stone steps', 'steps', 'staircase', 'paving stones', 'pavers', 'gravel path', 'stepping stones'] },
  { type: 'building', weight: 5, terms: ['house', 'shed', 'garage', 'building', 'outbuilding'] },
  { type: 'fence', weight: 5, terms: ['wooden fence', 'garden fence', 'privacy fence', 'fence', 'fencing'] },
  { type: 'water', weight: 5, terms: ['pond', 'pool', 'water feature'] },
  { type: 'object', weight: 2, terms: ['wheelbarrow', 'bench', 'chair', 'table', 'container', 'garden furniture'] },
];

function fallbackType(semanticLabel: string, preliminaryType: string): VisionType {
  const preliminary = preliminaryType.toLowerCase();
  const allowed: VisionType[] = ['tree', 'bush', 'hedge', 'lawn', 'bed', 'path', 'patio', 'building', 'fence', 'play_equipment', 'water', 'terrain', 'object', 'vegetation', 'structure', 'unknown'];
  if (allowed.includes(preliminary as VisionType)) return preliminary as VisionType;
  switch (semanticLabel.toUpperCase()) {
    case 'TREE': return 'vegetation';
    case 'TERRAIN': return 'terrain';
    case 'BUILDING': return 'building';
    case 'STRUCTURE': return 'structure';
    case 'ROAD':
    case 'SIDEWALK': return 'path';
    case 'WATER': return 'water';
    case 'OBJECT': return 'object';
    default: return 'unknown';
  }
}

function classifyDescription(description: string, semanticLabel: string, preliminaryType: string) {
  const text = description.toLowerCase();
  const scores = new Map<VisionType, number>();
  for (const group of keywordGroups) {
    for (const term of group.terms) {
      if (text.includes(term)) scores.set(group.type, (scores.get(group.type) ?? 0) + group.weight);
    }
  }

  const semantic = semanticLabel.toUpperCase();
  if (semantic === 'TREE') scores.set('vegetation', (scores.get('vegetation') ?? 0) + 1);
  if (semantic === 'BUILDING') scores.set('building', (scores.get('building') ?? 0) + 1);
  if (semantic === 'STRUCTURE') scores.set('structure', (scores.get('structure') ?? 0) + 1);
  if (semantic === 'TERRAIN') scores.set('terrain', (scores.get('terrain') ?? 0) + 1);
  if (semantic === 'SIDEWALK' || semantic === 'ROAD') scores.set('path', (scores.get('path') ?? 0) + 1);
  if (semantic === 'WATER') scores.set('water', (scores.get('water') ?? 0) + 1);

  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  const fallback = fallbackType(semanticLabel, preliminaryType);
  const winner = ranked[0];
  if (!winner || winner[1] < 3) return { type: fallback, confidence: 0.42 };
  const runnerUp = ranked[1]?.[1] ?? 0;
  const margin = Math.max(0, winner[1] - runnerUp);
  const confidence = Math.min(0.96, 0.62 + winner[1] * 0.035 + margin * 0.025);
  return { type: winner[0], confidence };
}

function parseJsonColumn<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

async function loadScanSession(db: D1Database, gardenId: string, sessionId: string) {
  const row = await db.prepare(
    `SELECT id, garden_id, session_id, coordinate_frame, bounds_json, draft_features_json, review_status, created_at, updated_at
     FROM smart_scan_sessions WHERE garden_id = ? AND session_id = ?`,
  ).bind(gardenId, sessionId).first<SmartScanSessionRow>();
  if (!row) return null;

  const reviews = await db.prepare(
    `SELECT feature_id, decision, type_override, footprint_json, updated_at
     FROM smart_scan_feature_reviews WHERE garden_id = ? AND session_id = ? ORDER BY feature_id`,
  ).bind(gardenId, sessionId).all<SmartScanReviewRow>();

  return {
    id: row.id,
    gardenId: row.garden_id,
    sessionId: row.session_id,
    coordinateFrame: row.coordinate_frame,
    bounds: parseJsonColumn(row.bounds_json, {}),
    draftFeatures: parseJsonColumn(row.draft_features_json, []),
    reviewStatus: row.review_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviews: reviews.results.map((review) => ({
      featureId: review.feature_id,
      decision: review.decision,
      typeOverride: review.type_override,
      footprint: review.footprint_json ? parseJsonColumn(review.footprint_json, null) : null,
      updatedAt: review.updated_at,
    })),
  };
}

smartScanRoutes.post('/:gardenId/smart-scan/classify', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');

  const parsed = classifySmartScanSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Scan-udsnittene er ikke gyldige.', 'INVALID_SMART_SCAN_VISION', parsed.error.flatten());

  if (!parsed.data.force) {
    const cached = await c.env.DB.prepare(
      'SELECT classifications_json FROM smart_scan_vision_cache WHERE garden_id = ? AND session_id = ?',
    ).bind(gardenId, parsed.data.sessionId).first<{ classifications_json: string }>();
    if (cached) {
      return c.json({
        sessionId: parsed.data.sessionId,
        classifications: parseJsonColumn(cached.classifications_json, []),
        cached: true,
      });
    }
  }

  try {
    const files = parsed.data.candidates.map((candidate) => ({
      name: `${candidate.clusterId}.${candidate.mimeType === 'image/png' ? 'png' : 'jpg'}`,
      blob: new Blob([decodeBase64(candidate.imageBase64)], { type: candidate.mimeType }),
    }));

    const converted = await c.env.AI.toMarkdown(files);
    const conversions = Array.isArray(converted) ? converted : [converted];
    const byName = new Map(conversions.map((item) => [item.name, item]));

    const classifications = parsed.data.candidates.map((candidate) => {
      const filename = `${candidate.clusterId}.${candidate.mimeType === 'image/png' ? 'png' : 'jpg'}`;
      const conversion = byName.get(filename);
      const description = conversion && conversion.format !== 'error' ? conversion.data ?? '' : '';
      const classification = classifyDescription(description, candidate.semanticLabel, candidate.preliminaryType);
      return {
        clusterId: candidate.clusterId,
        type: classification.type,
        confidence: classification.confidence,
        description,
        semanticLabel: candidate.semanticLabel,
        model: 'cloudflare-ai-image-description',
      };
    });

    await c.env.DB.prepare(
      `INSERT INTO smart_scan_vision_cache (garden_id, session_id, classifications_json, created_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(garden_id, session_id) DO UPDATE SET
         classifications_json = excluded.classifications_json,
         updated_at = CURRENT_TIMESTAMP`,
    ).bind(gardenId, parsed.data.sessionId, JSON.stringify(classifications)).run();

    return c.json({ sessionId: parsed.data.sessionId, classifications, cached: false });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'Smart Scan vision failed', error: error instanceof Error ? error.message : String(error) }));
    return jsonError(c, 503, 'Billedforståelsen kunne ikke gennemføres lige nu.', 'SMART_SCAN_VISION_FAILED');
  }
});

smartScanRoutes.post('/:gardenId/smart-scan/sessions', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = saveScanSessionSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Scan-resultatet kunne ikke gemmes.', 'INVALID_SMART_SCAN_SESSION', parsed.error.flatten());

  const existing = await c.env.DB.prepare(
    'SELECT id FROM smart_scan_sessions WHERE garden_id = ? AND session_id = ?',
  ).bind(gardenId, parsed.data.sessionId).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();

  await c.env.DB.prepare(
    `INSERT INTO smart_scan_sessions
       (id, garden_id, session_id, coordinate_frame, bounds_json, draft_features_json, review_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(garden_id, session_id) DO UPDATE SET
       coordinate_frame = excluded.coordinate_frame,
       bounds_json = excluded.bounds_json,
       draft_features_json = excluded.draft_features_json,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    id,
    gardenId,
    parsed.data.sessionId,
    parsed.data.coordinateFrame,
    JSON.stringify(parsed.data.bounds),
    JSON.stringify(parsed.data.draftFeatures),
  ).run();

  return c.json({ session: await loadScanSession(c.env.DB, gardenId, parsed.data.sessionId) }, existing ? 200 : 201);
});

smartScanRoutes.get('/:gardenId/smart-scan/sessions/:sessionId', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const session = await loadScanSession(c.env.DB, gardenId, c.req.param('sessionId'));
  if (!session) return jsonError(c, 404, 'Smart Scan-sessionen blev ikke fundet.', 'SMART_SCAN_SESSION_NOT_FOUND');
  return c.json({ session });
});

smartScanRoutes.patch('/:gardenId/smart-scan/sessions/:sessionId/features/:featureId', async (c) => {
  const gardenId = c.req.param('gardenId');
  const sessionId = c.req.param('sessionId');
  const featureId = c.req.param('featureId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  const parsed = reviewFeatureSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Review-valget er ikke gyldigt.', 'INVALID_SMART_SCAN_REVIEW', parsed.error.flatten());

  const session = await loadScanSession(c.env.DB, gardenId, sessionId);
  if (!session) return jsonError(c, 404, 'Smart Scan-sessionen blev ikke fundet.', 'SMART_SCAN_SESSION_NOT_FOUND');
  const draftFeatures = session.draftFeatures as Array<{ id?: string }>;
  if (!draftFeatures.some((feature) => feature.id === featureId)) {
    return jsonError(c, 404, 'Feature-kandidaten blev ikke fundet.', 'SMART_SCAN_FEATURE_NOT_FOUND');
  }

  await c.env.DB.prepare(
    `INSERT INTO smart_scan_feature_reviews
       (garden_id, session_id, feature_id, decision, type_override, footprint_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(garden_id, session_id, feature_id) DO UPDATE SET
       decision = excluded.decision,
       type_override = excluded.type_override,
       footprint_json = excluded.footprint_json,
       updated_at = CURRENT_TIMESTAMP`,
  ).bind(
    gardenId,
    sessionId,
    featureId,
    parsed.data.decision,
    parsed.data.typeOverride ?? null,
    parsed.data.footprint ? JSON.stringify(parsed.data.footprint) : null,
  ).run();

  const reviewed = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM smart_scan_feature_reviews
     WHERE garden_id = ? AND session_id = ? AND decision IN ('accepted', 'rejected')`,
  ).bind(gardenId, sessionId).first<{ count: number }>();
  const status = (reviewed?.count ?? 0) >= draftFeatures.length ? 'reviewed' : 'reviewing';
  await c.env.DB.prepare(
    'UPDATE smart_scan_sessions SET review_status = ?, updated_at = CURRENT_TIMESTAMP WHERE garden_id = ? AND session_id = ?',
  ).bind(status, gardenId, sessionId).run();

  return c.json({ session: await loadScanSession(c.env.DB, gardenId, sessionId) });
});
