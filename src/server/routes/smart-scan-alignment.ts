import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { gardenBelongsToUser } from '../repositories/gardens';
import { requireAuth } from '../middleware/auth';
import type { AppEnvironment } from '../types';
import { parseJson } from '../utils/request';
import { jsonError } from '../utils/response';

const alignmentSchema = z.object({
  anchorLat: z.number().min(-90).max(90),
  anchorLng: z.number().min(-180).max(180),
  originX: z.number().finite(),
  originZ: z.number().finite(),
  rotationDegrees: z.number().finite().min(-3600).max(3600),
  scale: z.number().finite().min(0.5).max(1.5),
  status: z.enum(['draft', 'aligned']).default('draft'),
});

type AlignmentRow = {
  alignment_json: string;
  alignment_status: 'unplaced' | 'draft' | 'aligned';
};

export const smartScanAlignmentRoutes = new Hono<AppEnvironment>();
smartScanAlignmentRoutes.use('*', requireAuth);

async function ownsGarden(c: Context<AppEnvironment>): Promise<boolean> {
  return gardenBelongsToUser(c.env.DB, c.get('user').id, c.req.param('gardenId'));
}

function parseAlignment(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { return {}; }
}

smartScanAlignmentRoutes.get('/:gardenId/smart-scan/sessions/:sessionId/alignment', async (c) => {
  const gardenId = c.req.param('gardenId');
  const sessionId = c.req.param('sessionId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');

  const row = await c.env.DB.prepare(
    `SELECT alignment_json, alignment_status
     FROM smart_scan_sessions WHERE garden_id = ? AND session_id = ?`,
  ).bind(gardenId, sessionId).first<AlignmentRow>();
  if (!row) return jsonError(c, 404, 'Smart Scan-sessionen blev ikke fundet.', 'SMART_SCAN_SESSION_NOT_FOUND');

  return c.json({ alignment: parseAlignment(row.alignment_json), status: row.alignment_status });
});

smartScanAlignmentRoutes.patch('/:gardenId/smart-scan/sessions/:sessionId/alignment', async (c) => {
  const gardenId = c.req.param('gardenId');
  const sessionId = c.req.param('sessionId');
  if (!(await ownsGarden(c))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');

  const parsed = alignmentSchema.safeParse(await parseJson<unknown>(c));
  if (!parsed.success) return jsonError(c, 422, 'Placeringen er ikke gyldig.', 'INVALID_SMART_SCAN_ALIGNMENT', parsed.error.flatten());

  const exists = await c.env.DB.prepare(
    'SELECT id FROM smart_scan_sessions WHERE garden_id = ? AND session_id = ?',
  ).bind(gardenId, sessionId).first<{ id: string }>();
  if (!exists) return jsonError(c, 404, 'Smart Scan-sessionen blev ikke fundet.', 'SMART_SCAN_SESSION_NOT_FOUND');

  const normalized = {
    ...parsed.data,
    rotationDegrees: ((parsed.data.rotationDegrees % 360) + 360) % 360,
  };
  await c.env.DB.prepare(
    `UPDATE smart_scan_sessions
     SET alignment_json = ?, alignment_status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE garden_id = ? AND session_id = ?`,
  ).bind(JSON.stringify(normalized), normalized.status, gardenId, sessionId).run();

  return c.json({ alignment: normalized, status: normalized.status });
});
