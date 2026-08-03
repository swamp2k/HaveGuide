import type { Garden, GardenDetail, GardenFeature } from '../../shared/types';
import type { FeatureType, Confidence } from '../../shared/types';
import type { GardenGeometry } from '../../shared/geojson';
import { nowIso } from '../utils/time';

interface GardenRow {
  id: string;
  name: string;
  address: string | null;
  notes: string | null;
  center_lat: number;
  center_lng: number;
  created_at: string;
  updated_at: string;
}

interface FeatureRow {
  id: string;
  garden_id: string;
  type: FeatureType;
  name: string;
  description: string | null;
  confidence: Confidence;
  geometry_json: string;
  created_at: string;
  updated_at: string;
}

function mapGarden(row: GardenRow): Garden {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? '',
    notes: row.notes ?? '',
    centerLat: row.center_lat,
    centerLng: row.center_lng,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFeature(row: FeatureRow): GardenFeature {
  return {
    id: row.id,
    gardenId: row.garden_id,
    type: row.type,
    name: row.name,
    description: row.description ?? '',
    confidence: row.confidence,
    geometry: JSON.parse(row.geometry_json) as GardenGeometry,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listGardens(db: D1Database, userId: string): Promise<Garden[]> {
  const rows = await db
    .prepare(
      `SELECT id, name, address, notes, center_lat, center_lng, created_at, updated_at
       FROM gardens WHERE user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<GardenRow>();
  return rows.results.map(mapGarden);
}

export async function createGarden(
  db: D1Database,
  userId: string,
  input: { name: string; address: string; notes: string; centerLat: number; centerLng: number },
): Promise<Garden> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO gardens
       (id, user_id, name, address, notes, center_lat, center_lng, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.name,
      input.address || null,
      input.notes || null,
      input.centerLat,
      input.centerLng,
      timestamp,
      timestamp,
    )
    .run();
  return { id, ...input, createdAt: timestamp, updatedAt: timestamp };
}

export async function getGarden(
  db: D1Database,
  userId: string,
  gardenId: string,
): Promise<GardenDetail | null> {
  const row = await db
    .prepare(
      `SELECT id, name, address, notes, center_lat, center_lng, created_at, updated_at
       FROM gardens WHERE id = ? AND user_id = ? AND archived_at IS NULL LIMIT 1`,
    )
    .bind(gardenId, userId)
    .first<GardenRow>();
  if (!row) return null;

  const features = await db
    .prepare(
      `SELECT id, garden_id, type, name, description, confidence, geometry_json, created_at, updated_at
       FROM garden_features WHERE garden_id = ? AND archived_at IS NULL ORDER BY created_at ASC`,
    )
    .bind(gardenId)
    .all<FeatureRow>();

  return { ...mapGarden(row), features: features.results.map(mapFeature) };
}

export async function updateGarden(
  db: D1Database,
  userId: string,
  gardenId: string,
  input: Partial<{ name: string; address: string; notes: string; centerLat: number; centerLng: number }>,
): Promise<Garden | null> {
  const current = await getGarden(db, userId, gardenId);
  if (!current) return null;
  const next = {
    name: input.name ?? current.name,
    address: input.address ?? current.address,
    notes: input.notes ?? current.notes,
    centerLat: input.centerLat ?? current.centerLat,
    centerLng: input.centerLng ?? current.centerLng,
  };
  const updatedAt = nowIso();
  await db
    .prepare(
      `UPDATE gardens SET name = ?, address = ?, notes = ?, center_lat = ?, center_lng = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      next.name,
      next.address || null,
      next.notes || null,
      next.centerLat,
      next.centerLng,
      updatedAt,
      gardenId,
      userId,
    )
    .run();
  return { ...current, ...next, updatedAt };
}

export async function gardenBelongsToUser(
  db: D1Database,
  userId: string,
  gardenId: string | undefined,
): Promise<boolean> {
  if (!gardenId) return false;
  const row = await db
    .prepare('SELECT 1 AS found FROM gardens WHERE id = ? AND user_id = ? AND archived_at IS NULL LIMIT 1')
    .bind(gardenId, userId)
    .first<{ found: number }>();
  return row?.found === 1;
}

export async function featureBelongsToGarden(
  db: D1Database,
  featureId: string,
  gardenId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      'SELECT 1 AS found FROM garden_features WHERE id = ? AND garden_id = ? AND archived_at IS NULL LIMIT 1',
    )
    .bind(featureId, gardenId)
    .first<{ found: number }>();
  return row?.found === 1;
}
