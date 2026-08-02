import type { GardenFeature } from '../../shared/types';
import type { Confidence, FeatureType } from '../../shared/types';
import type { GardenGeometry } from '../../shared/geojson';
import { nowIso } from '../utils/time';

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

export async function createFeature(
  db: D1Database,
  gardenId: string,
  input: {
    type: FeatureType;
    name: string;
    description: string;
    confidence: Confidence;
    geometry: GardenGeometry;
  },
): Promise<GardenFeature> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await db
    .prepare(
      `INSERT INTO garden_features
       (id, garden_id, type, name, description, confidence, geometry_type, geometry_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      gardenId,
      input.type,
      input.name,
      input.description || null,
      input.confidence,
      input.geometry.type,
      JSON.stringify(input.geometry),
      timestamp,
      timestamp,
    )
    .run();
  return { id, gardenId, ...input, createdAt: timestamp, updatedAt: timestamp };
}

export async function getFeature(db: D1Database, featureId: string): Promise<GardenFeature | null> {
  const row = await db
    .prepare(
      `SELECT id, garden_id, type, name, description, confidence, geometry_json, created_at, updated_at
       FROM garden_features WHERE id = ? AND archived_at IS NULL LIMIT 1`,
    )
    .bind(featureId)
    .first<FeatureRow>();
  return row ? mapFeature(row) : null;
}

export async function updateFeature(
  db: D1Database,
  featureId: string,
  input: Partial<{
    type: FeatureType;
    name: string;
    description: string;
    confidence: Confidence;
    geometry: GardenGeometry;
  }>,
): Promise<GardenFeature | null> {
  const current = await getFeature(db, featureId);
  if (!current) return null;
  const next = {
    type: input.type ?? current.type,
    name: input.name ?? current.name,
    description: input.description ?? current.description,
    confidence: input.confidence ?? current.confidence,
    geometry: input.geometry ?? current.geometry,
  };
  const updatedAt = nowIso();
  await db
    .prepare(
      `UPDATE garden_features
       SET type = ?, name = ?, description = ?, confidence = ?, geometry_type = ?, geometry_json = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      next.type,
      next.name,
      next.description || null,
      next.confidence,
      next.geometry.type,
      JSON.stringify(next.geometry),
      updatedAt,
      featureId,
    )
    .run();
  return { ...current, ...next, updatedAt };
}

export async function archiveFeature(db: D1Database, featureId: string): Promise<boolean> {
  const timestamp = nowIso();
  const result = await db
    .prepare('UPDATE garden_features SET archived_at = ?, updated_at = ? WHERE id = ? AND archived_at IS NULL')
    .bind(timestamp, timestamp, featureId)
    .run();
  return (result.meta.changes ?? 0) === 1;
}
