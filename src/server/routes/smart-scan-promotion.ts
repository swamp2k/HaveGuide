import { Hono } from 'hono';
import type { Confidence, FeatureType } from '../../shared/types';
import { gardenBelongsToUser, getGarden } from '../repositories/gardens';
import { requireAuth } from '../middleware/auth';
import type { AppEnvironment } from '../types';
import { nowIso } from '../utils/time';
import { jsonError } from '../utils/response';

type LocalPoint = [number, number];
type LngLat = [number, number];
type DriftKnot = { position: number; offsetX: number; offsetZ: number };
type Alignment = {
  anchorLat: number; anchorLng: number; originX: number; originZ: number;
  rotationDegrees: number; scale: number; status: 'draft' | 'aligned';
  driftCorrection?: { axis: 'x' | 'z'; knots: DriftKnot[] } | null;
};
type DraftFeature = { id: string; type: string; confidence: number; footprint?: LocalPoint[] };
type SessionRow = { draft_features_json: string; alignment_json: string; alignment_status: string };
type ReviewRow = { feature_id: string; type_override: string | null; footprint_json: string | null };
type ImportedRow = { id: string; source_feature_id: string | null };

export const smartScanPromotionRoutes = new Hono<AppEnvironment>();
smartScanPromotionRoutes.use('*', requireAuth);

function json<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function corrected(point: LocalPoint, alignment: Alignment): LocalPoint {
  const correction = alignment.driftCorrection;
  if (!correction || correction.knots.length < 2) return point;
  const coordinate = correction.axis === 'x' ? point[0] : point[1];
  let left = correction.knots[0]!;
  let right = correction.knots.at(-1)!;
  for (let i = 0; i < correction.knots.length - 1; i += 1) {
    const a = correction.knots[i]!;
    const b = correction.knots[i + 1]!;
    if (coordinate >= a.position && coordinate <= b.position) { left = a; right = b; break; }
  }
  const t = Math.max(0, Math.min(1, (coordinate - left.position) / Math.max(.001, right.position - left.position)));
  return [point[0] + left.offsetX + (right.offsetX - left.offsetX) * t, point[1] + left.offsetZ + (right.offsetZ - left.offsetZ) * t];
}

function transform(point: LocalPoint, alignment: Alignment): LngLat {
  const p = corrected(point, alignment);
  const angle = alignment.rotationDegrees * Math.PI / 180;
  const x = (p[0] - alignment.originX) * alignment.scale;
  const z = (p[1] - alignment.originZ) * alignment.scale;
  const east = x * Math.cos(angle) - z * Math.sin(angle);
  const north = x * Math.sin(angle) + z * Math.cos(angle);
  const metersLng = Math.max(1, 111_320 * Math.cos(alignment.anchorLat * Math.PI / 180));
  return [alignment.anchorLng + east / metersLng, alignment.anchorLat + north / 111_320];
}

function inside(point: LngLat, polygon: LngLat[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!; const b = polygon[j]!;
    if (((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / ((b[1] - a[1]) || Number.EPSILON) + a[0]) result = !result;
  }
  return result;
}

function ringInside(ring: LngLat[], boundary: LngLat[]): boolean {
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!; const b = ring[(i + 1) % ring.length]!;
    for (let step = 0; step <= 8; step += 1) {
      const t = step / 8;
      if (!inside([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], boundary)) return false;
    }
  }
  return true;
}

function mappedType(value: string): FeatureType {
  const map: Record<string, FeatureType> = { tree: 'tree', bush: 'shrub', hedge: 'hedge', lawn: 'lawn', bed: 'bed', path: 'path', patio: 'terrace', building: 'building' };
  return map[value] ?? 'other_area';
}

function label(type: FeatureType): string {
  const labels: Partial<Record<FeatureType, string>> = { tree: 'Træ', shrub: 'Busk', hedge: 'Hæk', lawn: 'Græs', bed: 'Bed', path: 'Sti', terrace: 'Terrasse', building: 'Bygning' };
  return labels[type] ?? 'Område';
}

smartScanPromotionRoutes.post('/:gardenId/smart-scan/sessions/:sessionId/promote', async (c) => {
  const gardenId = c.req.param('gardenId');
  const sessionId = c.req.param('sessionId');
  const userId = c.get('user').id;
  if (!(await gardenBelongsToUser(c.env.DB, userId, gardenId))) return jsonError(c, 404, 'Haven blev ikke fundet.', 'GARDEN_NOT_FOUND');

  const session = await c.env.DB.prepare('SELECT draft_features_json, alignment_json, alignment_status FROM smart_scan_sessions WHERE garden_id = ? AND session_id = ?')
    .bind(gardenId, sessionId).first<SessionRow>();
  if (!session) return jsonError(c, 404, 'Smart Scan-sessionen blev ikke fundet.', 'SMART_SCAN_SESSION_NOT_FOUND');
  const alignment = json<Alignment | null>(session.alignment_json, null);
  if (session.alignment_status !== 'aligned' || !alignment || alignment.status !== 'aligned') return jsonError(c, 409, 'Godkend først placeringen af scan-modellen.', 'SMART_SCAN_ALIGNMENT_REQUIRED');

  const garden = await getGarden(c.env.DB, userId, gardenId);
  const boundaryFeature = garden?.features.find((feature) => feature.type === 'garden_boundary' && feature.geometry.type === 'Polygon');
  if (!garden || !boundaryFeature || boundaryFeature.geometry.type !== 'Polygon') return jsonError(c, 409, 'Tegn og gem først havens grænse.', 'GARDEN_BOUNDARY_REQUIRED');
  const boundary = boundaryFeature.geometry.coordinates[0] as LngLat[];
  const drafts = json<DraftFeature[]>(session.draft_features_json, []);
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
  const reviews = await c.env.DB.prepare("SELECT feature_id, type_override, footprint_json FROM smart_scan_feature_reviews WHERE garden_id = ? AND session_id = ? AND decision = 'accepted'")
    .bind(gardenId, sessionId).all<ReviewRow>();
  const existing = await c.env.DB.prepare("SELECT id, source_feature_id FROM garden_features WHERE garden_id = ? AND source_kind = 'smart_scan' AND source_session_id = ?")
    .bind(gardenId, sessionId).all<ImportedRow>();

  let created = 0; let updated = 0; let skippedBoundary = 0; let skippedMissing = 0;
  const promotedIds = new Set<string>();
  const timestamp = nowIso();
  for (const review of reviews.results) {
    const draft = draftById.get(review.feature_id);
    if (!draft) continue;
    const footprint = review.footprint_json ? json<LocalPoint[]>(review.footprint_json, []) : draft.footprint ?? [];
    if (footprint.length < 3) { skippedMissing += 1; continue; }
    const ring = footprint.map((point) => transform(point, alignment));
    if (!ringInside(ring, boundary)) { skippedBoundary += 1; continue; }
    promotedIds.add(draft.id);
    const type = mappedType(review.type_override ?? draft.type);
    const geometry = JSON.stringify({ type: 'Polygon', coordinates: [[...ring, ring[0]!]] });
    const confidence: Confidence = draft.confidence >= .72 ? 'likely' : 'unknown';
    const old = existing.results.find((item) => item.source_feature_id === draft.id);
    if (old) {
      await c.env.DB.prepare("UPDATE garden_features SET type = ?, name = ?, description = ?, confidence = ?, geometry_type = 'Polygon', geometry_json = ?, archived_at = NULL, updated_at = ? WHERE id = ?")
        .bind(type, label(type), 'Oprettet fra Smart Garden Scan.', confidence, geometry, timestamp, old.id).run();
      updated += 1;
    } else {
      await c.env.DB.prepare("INSERT INTO garden_features (id, garden_id, type, name, description, confidence, geometry_type, geometry_json, created_at, updated_at, source_kind, source_session_id, source_feature_id) VALUES (?, ?, ?, ?, ?, ?, 'Polygon', ?, ?, ?, 'smart_scan', ?, ?)")
        .bind(crypto.randomUUID(), gardenId, type, label(type), 'Oprettet fra Smart Garden Scan.', confidence, geometry, timestamp, timestamp, sessionId, draft.id).run();
      created += 1;
    }
  }

  let archived = 0;
  for (const old of existing.results) {
    if (!old.source_feature_id || promotedIds.has(old.source_feature_id)) continue;
    await c.env.DB.prepare('UPDATE garden_features SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL').bind(timestamp, timestamp, old.id).run();
    archived += 1;
  }

  return c.json({ garden: await getGarden(c.env.DB, userId, gardenId), summary: { accepted: reviews.results.length, promoted: promotedIds.size, created, updated, archived, skippedBoundary, skippedMissing } });
});
