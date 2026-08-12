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
  candidates: z.array(visionCandidateSchema).min(1).max(20),
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

  // Small ARCore priors break ties without overruling clear RGB evidence.
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

smartScanRoutes.post('/:gardenId/smart-scan/classify', async (c) => {
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');

  const parsed = classifySmartScanSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Scan-udsnittene er ikke gyldige.', 'INVALID_SMART_SCAN_VISION', parsed.error.flatten());

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

    return c.json({ sessionId: parsed.data.sessionId, classifications });
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'Smart Scan vision failed', error: error instanceof Error ? error.message : String(error) }));
    return jsonError(c, 503, 'Billedforståelsen kunne ikke gennemføres lige nu.', 'SMART_SCAN_VISION_FAILED');
  }
});
