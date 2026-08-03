import { calculateCompleteness } from '../../shared/completeness';
import type {
  AssessmentCategory,
  Confidence,
  DuplicatePlantCandidate,
  GardenAssessment,
  GardenObservation,
  GardenPlant,
  GardenUnderstanding,
  GardenWalk,
  ObservationKind,
  PlantIdentificationStatus,
  PlantOrgan,
} from '../../shared/types';
import type { GardenGeometry } from '../../shared/geojson';
import { nowIso } from '../utils/time';

interface WalkRow {
  id: string; garden_id: string; status: GardenWalk['status']; current_step: number;
  started_at: string; completed_at: string | null; updated_at: string;
}
interface ObservationRow {
  id: string; garden_id: string; feature_id: string | null; kind: ObservationKind; title: string;
  notes: string | null; latitude: number | null; longitude: number | null; bearing_degrees: number | null;
  environment_json: string | null; created_at: string; updated_at: string;
}
interface PlantRow {
  id: string; garden_id: string; feature_id: string | null; common_name: string | null;
  scientific_name: string | null; identification_status: PlantIdentificationStatus; confidence: Confidence;
  notes: string | null; latitude: number | null; longitude: number | null; created_at: string; updated_at: string;
}
interface PlantMediaRow { plant_id: string; media_id: string; organ: PlantOrgan; original_filename: string; }
interface SuggestionRow {
  plant_id: string; id: string; scientific_name: string; common_name: string | null; score: number; rank: number;
  gbif_id: string | null; accepted_at: string | null; rejected_at: string | null;
}
interface AssessmentRow {
  id: string; garden_id: string; category: AssessmentCategory; value: string; notes: string | null;
  geometry_json: string | null; created_at: string; updated_at: string;
}

function mapWalk(row: WalkRow): GardenWalk {
  return { id: row.id, gardenId: row.garden_id, status: row.status, currentStep: row.current_step,
    startedAt: row.started_at, completedAt: row.completed_at, updatedAt: row.updated_at };
}
function mapObservation(row: ObservationRow): GardenObservation {
  return { id: row.id, gardenId: row.garden_id, featureId: row.feature_id, kind: row.kind, title: row.title,
    notes: row.notes ?? '', latitude: row.latitude, longitude: row.longitude, bearingDegrees: row.bearing_degrees,
    environment: row.environment_json ? JSON.parse(row.environment_json) as Record<string, string> : {},
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapAssessment(row: AssessmentRow): GardenAssessment {
  return { id: row.id, gardenId: row.garden_id, category: row.category, value: row.value, notes: row.notes ?? '',
    geometry: row.geometry_json ? JSON.parse(row.geometry_json) as GardenGeometry : null,
    createdAt: row.created_at, updatedAt: row.updated_at };
}

function duplicateCandidates(plants: GardenPlant[]): DuplicatePlantCandidate[] {
  const candidates: DuplicatePlantCandidate[] = [];
  for (let index = 0; index < plants.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < plants.length; otherIndex += 1) {
      const first = plants[index];
      const second = plants[otherIndex];
      if (!first || !second) continue;
      const firstName = (first.scientificName || first.commonName).trim().toLocaleLowerCase('da');
      const secondName = (second.scientificName || second.commonName).trim().toLocaleLowerCase('da');
      if (firstName && firstName === secondName) {
        candidates.push({ plantId: first.id, possibleDuplicateId: second.id, reason: `Samme navn: ${first.scientificName || first.commonName}` });
      }
    }
  }
  return candidates;
}

export async function getGardenUnderstanding(
  db: D1Database,
  gardenId: string,
  options: { plantIdentificationAvailable: boolean; dataSources: GardenUnderstanding['dataSources'] },
): Promise<GardenUnderstanding> {
  const [walkRow, observationsResult, plantsResult, mediaResult, suggestionsResult, assessmentsResult, countRow] = await Promise.all([
    db.prepare(`SELECT id, garden_id, status, current_step, started_at, completed_at, updated_at
      FROM garden_walks WHERE garden_id = ? ORDER BY created_at DESC LIMIT 1`).bind(gardenId).first<WalkRow>(),
    db.prepare(`SELECT id, garden_id, feature_id, kind, title, notes, latitude, longitude, bearing_degrees,
      environment_json, created_at, updated_at FROM observations
      WHERE garden_id = ? AND archived_at IS NULL ORDER BY created_at DESC`).bind(gardenId).all<ObservationRow>(),
    db.prepare(`SELECT id, garden_id, feature_id, common_name, scientific_name, identification_status, confidence,
      notes, latitude, longitude, created_at, updated_at FROM plants
      WHERE garden_id = ? AND archived_at IS NULL ORDER BY created_at DESC`).bind(gardenId).all<PlantRow>(),
    db.prepare(`SELECT pm.plant_id, pm.media_id, pm.organ, m.original_filename
      FROM plant_media pm JOIN plants p ON p.id = pm.plant_id JOIN media m ON m.id = pm.media_id
      WHERE p.garden_id = ? AND p.archived_at IS NULL AND m.deleted_at IS NULL ORDER BY pm.created_at`).bind(gardenId).all<PlantMediaRow>(),
    db.prepare(`SELECT ir.plant_id, s.id, s.scientific_name, s.common_name, s.score, s.rank, s.gbif_id,
      s.accepted_at, s.rejected_at FROM identification_suggestions s
      JOIN identification_requests ir ON ir.id = s.request_id
      WHERE ir.garden_id = ? ORDER BY ir.requested_at DESC, s.rank ASC`).bind(gardenId).all<SuggestionRow>(),
    db.prepare(`SELECT id, garden_id, category, value, notes, geometry_json, created_at, updated_at
      FROM garden_assessments WHERE garden_id = ? AND archived_at IS NULL ORDER BY created_at DESC`).bind(gardenId).all<AssessmentRow>(),
    db.prepare(`SELECT
      (SELECT COUNT(*) FROM garden_features WHERE garden_id = ? AND archived_at IS NULL) AS features,
      (SELECT COUNT(*) FROM garden_features WHERE garden_id = ? AND type = 'garden_boundary' AND archived_at IS NULL) AS boundaries,
      (SELECT COUNT(*) FROM media_links ml JOIN media m ON m.id = ml.media_id WHERE ml.garden_id = ? AND m.deleted_at IS NULL) AS media,
      (SELECT COUNT(*) FROM plants WHERE garden_id = ? AND archived_at IS NULL) AS plants,
      (SELECT COUNT(DISTINCT category) FROM garden_assessments WHERE garden_id = ? AND archived_at IS NULL) AS assessments,
      (SELECT COUNT(*) FROM observations WHERE garden_id = ? AND archived_at IS NULL) AS observations`).bind(gardenId, gardenId, gardenId, gardenId, gardenId, gardenId)
      .first<{ features: number; boundaries: number; media: number; plants: number; assessments: number; observations: number }>(),
  ]);

  const mediaByPlant = new Map<string, GardenPlant['media']>();
  for (const row of mediaResult.results) {
    const items = mediaByPlant.get(row.plant_id) ?? [];
    items.push({ mediaId: row.media_id, organ: row.organ, originalFilename: row.original_filename, contentUrl: `/api/media/${row.media_id}/content` });
    mediaByPlant.set(row.plant_id, items);
  }
  const suggestionsByPlant = new Map<string, GardenPlant['suggestions']>();
  for (const row of suggestionsResult.results) {
    const items = suggestionsByPlant.get(row.plant_id) ?? [];
    if (!items.some((item) => item.id === row.id)) {
      items.push({ id: row.id, scientificName: row.scientific_name, commonName: row.common_name ?? '', score: row.score,
        rank: row.rank, gbifId: row.gbif_id, acceptedAt: row.accepted_at, rejectedAt: row.rejected_at });
    }
    suggestionsByPlant.set(row.plant_id, items);
  }
  const plants: GardenPlant[] = plantsResult.results.map((row) => ({
    id: row.id, gardenId: row.garden_id, featureId: row.feature_id, commonName: row.common_name ?? '',
    scientificName: row.scientific_name ?? '', identificationStatus: row.identification_status, confidence: row.confidence,
    notes: row.notes ?? '', latitude: row.latitude, longitude: row.longitude, media: mediaByPlant.get(row.id) ?? [],
    suggestions: suggestionsByPlant.get(row.id) ?? [], createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const counts = countRow ?? { features: 0, boundaries: 0, media: 0, plants: 0, assessments: 0, observations: 0 };
  return {
    walk: walkRow ? mapWalk(walkRow) : null,
    observations: observationsResult.results.map(mapObservation),
    plants,
    assessments: assessmentsResult.results.map(mapAssessment),
    duplicateCandidates: duplicateCandidates(plants),
    completeness: calculateCompleteness({
      featureCount: counts.features, hasBoundary: counts.boundaries > 0, mediaCount: counts.media,
      plantCount: counts.plants, assessmentCategoryCount: counts.assessments, observationCount: counts.observations,
      walkCompleted: walkRow?.status === 'completed',
    }),
    plantIdentificationAvailable: options.plantIdentificationAvailable,
    dataSources: options.dataSources,
  };
}

export async function startWalk(db: D1Database, gardenId: string): Promise<GardenWalk> {
  const existing = await db.prepare(`SELECT id, garden_id, status, current_step, started_at, completed_at, updated_at
    FROM garden_walks WHERE garden_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`).bind(gardenId).first<WalkRow>();
  if (existing) return mapWalk(existing);
  const id = crypto.randomUUID(); const timestamp = nowIso();
  await db.prepare(`INSERT INTO garden_walks (id, garden_id, status, current_step, started_at, created_at, updated_at)
    VALUES (?, ?, 'active', 0, ?, ?, ?)`).bind(id, gardenId, timestamp, timestamp, timestamp).run();
  return { id, gardenId, status: 'active', currentStep: 0, startedAt: timestamp, completedAt: null, updatedAt: timestamp };
}

export async function updateWalk(db: D1Database, gardenId: string, walkId: string,
  input: Partial<{ currentStep: number; status: GardenWalk['status'] }>): Promise<GardenWalk | null> {
  const current = await db.prepare(`SELECT id, garden_id, status, current_step, started_at, completed_at, updated_at
    FROM garden_walks WHERE id = ? AND garden_id = ? LIMIT 1`).bind(walkId, gardenId).first<WalkRow>();
  if (!current) return null;
  const status = input.status ?? current.status; const currentStep = input.currentStep ?? current.current_step;
  const updatedAt = nowIso(); const completedAt = status === 'completed' ? (current.completed_at ?? updatedAt) : null;
  await db.prepare(`UPDATE garden_walks SET status = ?, current_step = ?, completed_at = ?, updated_at = ?
    WHERE id = ? AND garden_id = ?`).bind(status, currentStep, completedAt, updatedAt, walkId, gardenId).run();
  return { id: walkId, gardenId, status, currentStep, startedAt: current.started_at, completedAt, updatedAt };
}

export async function createObservation(db: D1Database, gardenId: string, input: {
  featureId?: string; kind: ObservationKind; title: string; notes: string; latitude?: number; longitude?: number;
  bearingDegrees?: number; environment: Record<string, string>;
}): Promise<GardenObservation> {
  const id = crypto.randomUUID(); const timestamp = nowIso();
  await db.prepare(`INSERT INTO observations
    (id, garden_id, feature_id, kind, title, notes, latitude, longitude, bearing_degrees, environment_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, gardenId, input.featureId ?? null, input.kind, input.title, input.notes || null,
      input.latitude ?? null, input.longitude ?? null, input.bearingDegrees ?? null,
      Object.keys(input.environment).length ? JSON.stringify(input.environment) : null, timestamp, timestamp).run();
  return { id, gardenId, featureId: input.featureId ?? null, kind: input.kind, title: input.title, notes: input.notes,
    latitude: input.latitude ?? null, longitude: input.longitude ?? null, bearingDegrees: input.bearingDegrees ?? null,
    environment: input.environment, createdAt: timestamp, updatedAt: timestamp };
}

export async function archiveObservation(db: D1Database, gardenId: string, observationId: string): Promise<boolean> {
  const timestamp = nowIso();
  const result = await db.prepare(`UPDATE observations SET archived_at = ?, updated_at = ?
    WHERE id = ? AND garden_id = ? AND archived_at IS NULL`).bind(timestamp, timestamp, observationId, gardenId).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function createPlant(db: D1Database, gardenId: string, input: {
  featureId?: string; commonName: string; scientificName: string; identificationStatus: PlantIdentificationStatus;
  confidence: Confidence; notes: string; latitude?: number; longitude?: number;
}): Promise<GardenPlant> {
  const id = crypto.randomUUID(); const timestamp = nowIso();
  await db.prepare(`INSERT INTO plants
    (id, garden_id, feature_id, common_name, scientific_name, identification_status, confidence, notes, latitude, longitude, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, gardenId, input.featureId ?? null, input.commonName || null, input.scientificName || null,
      input.identificationStatus, input.confidence, input.notes || null, input.latitude ?? null, input.longitude ?? null,
      timestamp, timestamp).run();
  return { id, gardenId, featureId: input.featureId ?? null, commonName: input.commonName,
    scientificName: input.scientificName, identificationStatus: input.identificationStatus, confidence: input.confidence,
    notes: input.notes, latitude: input.latitude ?? null, longitude: input.longitude ?? null, media: [], suggestions: [],
    createdAt: timestamp, updatedAt: timestamp };
}

export async function updatePlant(db: D1Database, gardenId: string, plantId: string, input: Partial<{
  featureId: string; commonName: string; scientificName: string; identificationStatus: PlantIdentificationStatus;
  confidence: Confidence; notes: string; latitude: number; longitude: number;
}>): Promise<boolean> {
  const current = await db.prepare(`SELECT feature_id, common_name, scientific_name, identification_status, confidence,
    notes, latitude, longitude FROM plants WHERE id = ? AND garden_id = ? AND archived_at IS NULL`).bind(plantId, gardenId)
    .first<{ feature_id: string | null; common_name: string | null; scientific_name: string | null;
      identification_status: PlantIdentificationStatus; confidence: Confidence; notes: string | null;
      latitude: number | null; longitude: number | null }>();
  if (!current) return false;
  await db.prepare(`UPDATE plants SET feature_id = ?, common_name = ?, scientific_name = ?, identification_status = ?,
    confidence = ?, notes = ?, latitude = ?, longitude = ?, updated_at = ? WHERE id = ? AND garden_id = ?`)
    .bind(input.featureId ?? current.feature_id, input.commonName ?? current.common_name, input.scientificName ?? current.scientific_name,
      input.identificationStatus ?? current.identification_status, input.confidence ?? current.confidence,
      input.notes ?? current.notes, input.latitude ?? current.latitude, input.longitude ?? current.longitude,
      nowIso(), plantId, gardenId).run();
  return true;
}

export async function archivePlant(db: D1Database, gardenId: string, plantId: string): Promise<boolean> {
  const timestamp = nowIso();
  const result = await db.prepare(`UPDATE plants SET archived_at = ?, updated_at = ?
    WHERE id = ? AND garden_id = ? AND archived_at IS NULL`).bind(timestamp, timestamp, plantId, gardenId).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function linkPlantMedia(db: D1Database, gardenId: string, plantId: string, mediaId: string, organ: PlantOrgan): Promise<boolean> {
  const valid = await db.prepare(`SELECT 1 AS found FROM plants p JOIN media_links ml ON ml.garden_id = p.garden_id
    JOIN media m ON m.id = ml.media_id WHERE p.id = ? AND p.garden_id = ? AND p.archived_at IS NULL
    AND m.id = ? AND m.deleted_at IS NULL LIMIT 1`).bind(plantId, gardenId, mediaId).first<{ found: number }>();
  if (!valid) return false;
  await db.prepare(`INSERT INTO plant_media (plant_id, media_id, organ, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(plant_id, media_id) DO UPDATE SET organ = excluded.organ`).bind(plantId, mediaId, organ, nowIso()).run();
  return true;
}

export async function createAssessment(db: D1Database, gardenId: string, input: {
  category: AssessmentCategory; value: string; notes: string; geometry: GardenGeometry | null;
}): Promise<GardenAssessment> {
  const id = crypto.randomUUID(); const timestamp = nowIso();
  await db.prepare(`INSERT INTO garden_assessments
    (id, garden_id, category, value, notes, geometry_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, gardenId, input.category, input.value, input.notes || null,
      input.geometry ? JSON.stringify(input.geometry) : null, timestamp, timestamp).run();
  return { id, gardenId, ...input, createdAt: timestamp, updatedAt: timestamp };
}

export interface PlantMediaForIdentification {
  mediaId: string; r2Key: string; contentType: string; originalFilename: string; organ: PlantOrgan;
}
export async function getPlantMediaForIdentification(db: D1Database, userId: string, gardenId: string, plantId: string,
  requestedMediaIds?: string[]): Promise<PlantMediaForIdentification[]> {
  const rows = await db.prepare(`SELECT m.id AS media_id, m.r2_key, m.content_type, m.original_filename, pm.organ
    FROM plant_media pm JOIN plants p ON p.id = pm.plant_id JOIN media m ON m.id = pm.media_id
    WHERE p.id = ? AND p.garden_id = ? AND p.archived_at IS NULL AND m.user_id = ? AND m.deleted_at IS NULL
    ORDER BY pm.created_at LIMIT 5`).bind(plantId, gardenId, userId).all<{
      media_id: string; r2_key: string; content_type: string; original_filename: string; organ: PlantOrgan;
    }>();
  const requested = requestedMediaIds ? new Set(requestedMediaIds) : null;
  return rows.results.filter((row) => !requested || requested.has(row.media_id)).map((row) => ({
    mediaId: row.media_id, r2Key: row.r2_key, contentType: row.content_type,
    originalFilename: row.original_filename, organ: row.organ,
  }));
}

export async function createIdentificationRequest(db: D1Database, gardenId: string, plantId: string, provider: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO identification_requests
    (id, garden_id, plant_id, provider, status, requested_at) VALUES (?, ?, ?, ?, 'pending', ?)`)
    .bind(id, gardenId, plantId, provider, nowIso()).run();
  return id;
}

export async function completeIdentification(db: D1Database, requestId: string, suggestions: Array<{
  scientificName: string; commonName: string; score: number; gbifId: string | null; raw: unknown;
}>): Promise<void> {
  const timestamp = nowIso();
  const statements = suggestions.slice(0, 5).map((suggestion, index) => db.prepare(`INSERT INTO identification_suggestions
    (id, request_id, scientific_name, common_name, score, rank, gbif_id, raw_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), requestId, suggestion.scientificName,
      suggestion.commonName || null, suggestion.score, index + 1, suggestion.gbifId, JSON.stringify(suggestion.raw)));
  statements.push(db.prepare(`UPDATE identification_requests SET status = 'completed', completed_at = ? WHERE id = ?`)
    .bind(timestamp, requestId));
  const request = await db.prepare('SELECT plant_id FROM identification_requests WHERE id = ?').bind(requestId).first<{ plant_id: string }>();
  if (request) statements.push(db.prepare(`UPDATE plants SET identification_status = 'suggested', updated_at = ? WHERE id = ?`)
    .bind(timestamp, request.plant_id));
  await db.batch(statements);
}

export async function failIdentification(db: D1Database, requestId: string, message: string): Promise<void> {
  await db.prepare(`UPDATE identification_requests SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?`)
    .bind(message.slice(0, 1000), nowIso(), requestId).run();
}

export async function decideSuggestion(db: D1Database, gardenId: string, suggestionId: string, action: 'accept' | 'reject'): Promise<boolean> {
  const row = await db.prepare(`SELECT s.id, s.scientific_name, s.common_name, ir.plant_id
    FROM identification_suggestions s JOIN identification_requests ir ON ir.id = s.request_id
    WHERE s.id = ? AND ir.garden_id = ? LIMIT 1`).bind(suggestionId, gardenId)
    .first<{ id: string; scientific_name: string; common_name: string | null; plant_id: string }>();
  if (!row) return false;
  const timestamp = nowIso();
  if (action === 'reject') {
    await db.prepare('UPDATE identification_suggestions SET rejected_at = ? WHERE id = ?').bind(timestamp, suggestionId).run();
    return true;
  }
  await db.batch([
    db.prepare(`UPDATE identification_suggestions SET accepted_at = ?, rejected_at = NULL WHERE id = ?`).bind(timestamp, suggestionId),
    db.prepare(`UPDATE identification_suggestions SET rejected_at = ? WHERE request_id =
      (SELECT request_id FROM identification_suggestions WHERE id = ?) AND id <> ? AND accepted_at IS NULL`)
      .bind(timestamp, suggestionId, suggestionId),
    db.prepare(`UPDATE plants SET scientific_name = ?, common_name = COALESCE(NULLIF(?, ''), common_name),
      identification_status = 'confirmed', confidence = 'certain', updated_at = ? WHERE id = ?`)
      .bind(row.scientific_name, row.common_name ?? '', timestamp, row.plant_id),
  ]);
  return true;
}

export async function mergePlants(db: D1Database, gardenId: string, targetPlantId: string, duplicatePlantId: string): Promise<boolean> {
  if (targetPlantId === duplicatePlantId) return false;
  const rows = await db.prepare(`SELECT id FROM plants WHERE garden_id = ? AND id IN (?, ?) AND archived_at IS NULL`)
    .bind(gardenId, targetPlantId, duplicatePlantId).all<{ id: string }>();
  if (rows.results.length !== 2) return false;
  const timestamp = nowIso();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO plant_media (plant_id, media_id, organ, created_at)
      SELECT ?, media_id, organ, created_at FROM plant_media WHERE plant_id = ?`).bind(targetPlantId, duplicatePlantId),
    db.prepare(`UPDATE plants SET archived_at = ?, updated_at = ? WHERE id = ? AND garden_id = ?`)
      .bind(timestamp, timestamp, duplicatePlantId, gardenId),
    db.prepare(`UPDATE plants SET updated_at = ? WHERE id = ? AND garden_id = ?`).bind(timestamp, targetPlantId, gardenId),
  ]);
  return true;
}
