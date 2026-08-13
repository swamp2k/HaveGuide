import { Hono } from 'hono';
import { gardenBelongsToUser } from '../repositories/gardens';
import { requireAuth } from '../middleware/auth';
import type { AppEnvironment } from '../types';
import { jsonError } from '../utils/response';

type LatestRow = {
  session_id: string;
  alignment_status: 'unplaced' | 'draft' | 'aligned';
  draft_features_json: string;
  review_status: 'draft' | 'reviewing' | 'reviewed';
};

export const smartScanPromotionStatusRoutes = new Hono<AppEnvironment>();
smartScanPromotionStatusRoutes.use('*', requireAuth);

smartScanPromotionStatusRoutes.get('/:gardenId/smart-scan/promotion-status', async (c) => {
  const gardenId = c.req.param('gardenId');
  if (!(await gardenBelongsToUser(c.env.DB, c.get('user').id, gardenId))) {
    return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');
  }
  const latest = await c.env.DB.prepare(
    `SELECT session_id, alignment_status, draft_features_json, review_status
     FROM smart_scan_sessions WHERE garden_id = ? ORDER BY updated_at DESC LIMIT 1`,
  ).bind(gardenId).first<LatestRow>();
  if (!latest) return c.json({ available: false });

  const accepted = await c.env.DB.prepare(
    `SELECT COUNT(*) AS count FROM smart_scan_feature_reviews
     WHERE garden_id = ? AND session_id = ? AND decision = 'accepted'`,
  ).bind(gardenId, latest.session_id).first<{ count: number }>();
  let total = 0;
  try {
    const parsed = JSON.parse(latest.draft_features_json) as unknown;
    total = Array.isArray(parsed) ? parsed.length : 0;
  } catch { total = 0; }

  return c.json({
    available: true,
    sessionId: latest.session_id,
    alignmentStatus: latest.alignment_status,
    reviewStatus: latest.review_status,
    accepted: accepted?.count ?? 0,
    total,
  });
});
