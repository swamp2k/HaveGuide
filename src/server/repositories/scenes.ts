import type {
  AiAnalysis,
  AreaProfile,
  GardenScene,
  PlantIdentification,
  PlantSuggestion,
  SceneImage,
  SceneSummary,
} from '../../shared/types';
import { EMPTY_PROFILE, isProfileComplete } from '../../shared/profile';
import { nowIso } from '../utils/time';

interface SceneRow {
  id: string;
  title: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  sun: AreaProfile['sun'];
  moisture: AreaProfile['moisture'];
  soil: AreaProfile['soil'];
  drainage: AreaProfile['drainage'];
  wind: AreaProfile['wind'];
  notes: string;
  goals_json: string;
}

interface ImageRow {
  id: string;
  scene_id: string;
  kind: 'scene' | 'plant';
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
  r2_key: string;
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function profileFromRow(row: ProfileRow | null): AreaProfile {
  if (!row) return { ...EMPTY_PROFILE };
  return {
    sun: row.sun,
    moisture: row.moisture,
    soil: row.soil,
    drainage: row.drainage,
    wind: row.wind,
    notes: row.notes,
    goals: parseJsonArray(row.goals_json),
  };
}

function imageFromRow(row: ImageRow): SceneImage {
  return {
    id: row.id,
    sceneId: row.scene_id,
    kind: row.kind,
    filename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    url: `/api/images/${row.id}`,
  };
}

export async function listScenes(db: D1Database, userId: string): Promise<SceneSummary[]> {
  const rows = await db
    .prepare(
      `SELECT id, title, notes, created_at, updated_at
       FROM garden_scenes_v2 WHERE user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<SceneRow>();

  return Promise.all(
    (rows.results ?? []).map(async (scene) => {
      const [profileRow, imageRow] = await Promise.all([
        db.prepare('SELECT sun, moisture, soil, drainage, wind, notes, goals_json FROM garden_scene_profiles_v2 WHERE scene_id = ?')
          .bind(scene.id)
          .first<ProfileRow>(),
        db.prepare(
          `SELECT id, scene_id, kind, original_filename, content_type, size_bytes, created_at, r2_key
           FROM garden_scene_images_v2 WHERE scene_id = ? AND kind = 'scene' AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
        )
          .bind(scene.id)
          .first<ImageRow>(),
      ]);
      const profile = profileFromRow(profileRow);
      return {
        id: scene.id,
        title: scene.title,
        notes: scene.notes,
        createdAt: scene.created_at,
        updatedAt: scene.updated_at,
        profileComplete: isProfileComplete(profile),
        image: imageRow ? imageFromRow(imageRow) : null,
      };
    }),
  );
}

export async function createScene(
  db: D1Database,
  userId: string,
  input: { title: string; notes: string },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.batch([
    db.prepare(
      'INSERT INTO garden_scenes_v2 (id, user_id, title, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(id, userId, input.title, input.notes, now, now),
    db.prepare(
      `INSERT INTO garden_scene_profiles_v2 (scene_id, sun, moisture, soil, drainage, wind, notes, goals_json, updated_at)
       VALUES (?, NULL, NULL, NULL, NULL, NULL, '', '[]', ?)`,
    ).bind(id, now),
  ]);
  return id;
}

export async function updateScene(
  db: D1Database,
  userId: string,
  sceneId: string,
  input: { title?: string; notes?: string },
): Promise<boolean> {
  const existing = await ownedScene(db, userId, sceneId);
  if (!existing) return false;
  await db.prepare('UPDATE garden_scenes_v2 SET title = ?, notes = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .bind(input.title ?? existing.title, input.notes ?? existing.notes, nowIso(), sceneId, userId)
    .run();
  return true;
}

export async function ownedScene(db: D1Database, userId: string, sceneId: string): Promise<SceneRow | null> {
  return db.prepare(
    `SELECT id, title, notes, created_at, updated_at FROM garden_scenes_v2
     WHERE id = ? AND user_id = ? AND archived_at IS NULL LIMIT 1`,
  )
    .bind(sceneId, userId)
    .first<SceneRow>();
}

export async function getProfile(db: D1Database, sceneId: string): Promise<AreaProfile> {
  const row = await db.prepare(
    'SELECT sun, moisture, soil, drainage, wind, notes, goals_json FROM garden_scene_profiles_v2 WHERE scene_id = ?',
  )
    .bind(sceneId)
    .first<ProfileRow>();
  return profileFromRow(row);
}

export async function saveProfile(db: D1Database, sceneId: string, profile: AreaProfile): Promise<void> {
  const now = nowIso();
  await db.prepare(
    `INSERT INTO garden_scene_profiles_v2 (scene_id, sun, moisture, soil, drainage, wind, notes, goals_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scene_id) DO UPDATE SET sun=excluded.sun, moisture=excluded.moisture, soil=excluded.soil,
       drainage=excluded.drainage, wind=excluded.wind, notes=excluded.notes, goals_json=excluded.goals_json,
       updated_at=excluded.updated_at`,
  )
    .bind(
      sceneId,
      profile.sun,
      profile.moisture,
      profile.soil,
      profile.drainage,
      profile.wind,
      profile.notes,
      JSON.stringify(profile.goals),
      now,
    )
    .run();
  await db.prepare('UPDATE garden_scenes_v2 SET updated_at = ? WHERE id = ?').bind(now, sceneId).run();
}

export async function addImage(
  db: D1Database,
  userId: string,
  sceneId: string,
  input: { kind: 'scene' | 'plant'; r2Key: string; filename: string; contentType: string; sizeBytes: number },
): Promise<string> {
  const id = crypto.randomUUID();
  const now = nowIso();
  await db.batch([
    db.prepare(
      `INSERT INTO garden_scene_images_v2
       (id, scene_id, user_id, kind, r2_key, original_filename, content_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, sceneId, userId, input.kind, input.r2Key, input.filename, input.contentType, input.sizeBytes, now),
    db.prepare('UPDATE garden_scenes_v2 SET updated_at = ? WHERE id = ?').bind(now, sceneId),
  ]);
  return id;
}

export async function findOwnedImage(
  db: D1Database,
  userId: string,
  imageId: string,
): Promise<(ImageRow & { user_id: string }) | null> {
  return db.prepare(
    `SELECT i.id, i.scene_id, i.kind, i.original_filename, i.content_type, i.size_bytes, i.created_at, i.r2_key, i.user_id
     FROM garden_scene_images_v2 i JOIN garden_scenes_v2 s ON s.id = i.scene_id
     WHERE i.id = ? AND i.user_id = ? AND s.user_id = ? AND i.deleted_at IS NULL AND s.archived_at IS NULL LIMIT 1`,
  )
    .bind(imageId, userId, userId)
    .first<ImageRow & { user_id: string }>();
}

export async function listImages(db: D1Database, sceneId: string): Promise<SceneImage[]> {
  const rows = await db.prepare(
    `SELECT id, scene_id, kind, original_filename, content_type, size_bytes, created_at, r2_key
     FROM garden_scene_images_v2 WHERE scene_id = ? AND deleted_at IS NULL ORDER BY created_at DESC`,
  )
    .bind(sceneId)
    .all<ImageRow>();
  return (rows.results ?? []).map(imageFromRow);
}

interface IdentificationRow {
  id: string;
  scene_id: string;
  image_id: string;
  organ: PlantIdentification['organ'];
  suggestions_json: string;
  selected_suggestion_index: number;
  nickname: string;
  note: string;
  include_in_analysis: number;
  created_at: string;
  updated_at: string | null;
  image_kind: 'scene' | 'plant' | null;
  image_filename: string | null;
  image_content_type: string | null;
  image_size_bytes: number | null;
  image_created_at: string | null;
}

const IDENTIFICATION_SELECT = `SELECT p.id, p.scene_id, p.image_id, p.organ, p.suggestions_json,
    p.selected_suggestion_index, p.nickname, p.note, p.include_in_analysis, p.created_at, p.updated_at,
    i.kind AS image_kind, i.original_filename AS image_filename, i.content_type AS image_content_type,
    i.size_bytes AS image_size_bytes, i.created_at AS image_created_at
  FROM plant_identifications_v2 p
  LEFT JOIN garden_scene_images_v2 i ON i.id = p.image_id AND i.deleted_at IS NULL`;

function identificationFromRow(row: IdentificationRow): PlantIdentification {
  let suggestions: PlantSuggestion[] = [];
  try {
    const parsed = JSON.parse(row.suggestions_json);
    if (Array.isArray(parsed)) suggestions = parsed as PlantSuggestion[];
  } catch {
    suggestions = [];
  }
  const image: SceneImage | null = row.image_kind
    ? {
        id: row.image_id,
        sceneId: row.scene_id,
        kind: row.image_kind,
        filename: row.image_filename ?? '',
        contentType: row.image_content_type ?? 'image/jpeg',
        sizeBytes: row.image_size_bytes ?? 0,
        createdAt: row.image_created_at ?? row.created_at,
        url: `/api/images/${row.image_id}`,
      }
    : null;
  return {
    id: row.id,
    sceneId: row.scene_id,
    imageId: row.image_id,
    organ: row.organ,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    suggestions,
    selectedSuggestionIndex: Math.max(0, row.selected_suggestion_index ?? 0),
    nickname: row.nickname ?? '',
    note: row.note ?? '',
    includeInAnalysis: (row.include_in_analysis ?? 1) !== 0,
    image,
  };
}

export async function saveIdentification(
  db: D1Database,
  sceneId: string,
  imageId: string,
  organ: string,
  suggestions: PlantSuggestion[],
  meta: { nickname?: string; note?: string } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO plant_identifications_v2
       (id, scene_id, image_id, organ, provider, suggestions_json, nickname, note, created_at)
     VALUES (?, ?, ?, ?, 'plantnet', ?, ?, ?, ?)`,
  )
    .bind(id, sceneId, imageId, organ, JSON.stringify(suggestions), meta.nickname ?? '', meta.note ?? '', nowIso())
    .run();
  return id;
}

export async function listIdentifications(db: D1Database, sceneId: string): Promise<PlantIdentification[]> {
  const rows = await db.prepare(`${IDENTIFICATION_SELECT} WHERE p.scene_id = ? ORDER BY p.created_at DESC`)
    .bind(sceneId)
    .all<IdentificationRow>();
  return (rows.results ?? []).map(identificationFromRow);
}

export async function findIdentification(
  db: D1Database,
  sceneId: string,
  identificationId: string,
): Promise<PlantIdentification | null> {
  const row = await db.prepare(`${IDENTIFICATION_SELECT} WHERE p.id = ? AND p.scene_id = ? LIMIT 1`)
    .bind(identificationId, sceneId)
    .first<IdentificationRow>();
  return row ? identificationFromRow(row) : null;
}

export async function updateIdentification(
  db: D1Database,
  sceneId: string,
  identificationId: string,
  patch: { nickname?: string; note?: string; includeInAnalysis?: boolean; selectedSuggestionIndex?: number },
): Promise<PlantIdentification | null> {
  const existing = await findIdentification(db, sceneId, identificationId);
  if (!existing) return null;
  const selectedIndex = patch.selectedSuggestionIndex ?? existing.selectedSuggestionIndex;
  const now = nowIso();
  await db.batch([
    db.prepare(
      `UPDATE plant_identifications_v2
       SET nickname = ?, note = ?, include_in_analysis = ?, selected_suggestion_index = ?, updated_at = ?
       WHERE id = ? AND scene_id = ?`,
    ).bind(
      patch.nickname ?? existing.nickname,
      patch.note ?? existing.note,
      (patch.includeInAnalysis ?? existing.includeInAnalysis) ? 1 : 0,
      Math.max(0, Math.min(selectedIndex, Math.max(0, existing.suggestions.length - 1))),
      now,
      identificationId,
      sceneId,
    ),
    db.prepare('UPDATE garden_scenes_v2 SET updated_at = ? WHERE id = ?').bind(now, sceneId),
  ]);
  return findIdentification(db, sceneId, identificationId);
}

/** Points an existing plant card at a fresh photo and result, keeping label, note and opt-in. */
export async function replaceIdentificationScan(
  db: D1Database,
  sceneId: string,
  identificationId: string,
  input: { imageId: string; organ: string; suggestions: PlantSuggestion[] },
): Promise<{ identification: PlantIdentification | null; previousImageId: string }> {
  const existing = await findIdentification(db, sceneId, identificationId);
  if (!existing) return { identification: null, previousImageId: '' };
  const now = nowIso();
  await db.batch([
    db.prepare(
      `UPDATE plant_identifications_v2
       SET image_id = ?, organ = ?, suggestions_json = ?, selected_suggestion_index = 0, updated_at = ?
       WHERE id = ? AND scene_id = ?`,
    ).bind(input.imageId, input.organ, JSON.stringify(input.suggestions), now, identificationId, sceneId),
    db.prepare('UPDATE garden_scenes_v2 SET updated_at = ? WHERE id = ?').bind(now, sceneId),
  ]);
  return {
    identification: await findIdentification(db, sceneId, identificationId),
    previousImageId: existing.imageId,
  };
}

/**
 * Removes a plant card together with its close-up photo. Returns the R2 key of that photo
 * so the caller can clean up storage. Overview photos are never touched.
 */
export async function deleteIdentification(
  db: D1Database,
  sceneId: string,
  identificationId: string,
): Promise<{ r2Key: string | null } | null> {
  const row = await db.prepare(
    `SELECT p.image_id, i.r2_key, i.kind
     FROM plant_identifications_v2 p
     LEFT JOIN garden_scene_images_v2 i ON i.id = p.image_id
     WHERE p.id = ? AND p.scene_id = ? LIMIT 1`,
  )
    .bind(identificationId, sceneId)
    .first<{ image_id: string; r2_key: string | null; kind: string | null }>();
  if (!row) return null;

  const plantImageId = row.kind === 'plant' ? row.image_id : null;
  const now = nowIso();
  const statements = [
    db.prepare('DELETE FROM plant_identifications_v2 WHERE id = ? AND scene_id = ?').bind(identificationId, sceneId),
  ];
  if (plantImageId) {
    statements.push(
      db.prepare("DELETE FROM garden_scene_images_v2 WHERE id = ? AND scene_id = ? AND kind = 'plant'")
        .bind(plantImageId, sceneId),
    );
  }
  statements.push(db.prepare('UPDATE garden_scenes_v2 SET updated_at = ? WHERE id = ?').bind(now, sceneId));
  await db.batch(statements);
  return { r2Key: plantImageId ? row.r2_key : null };
}

/** Drops an orphaned plant close-up (used after a re-scan replaced it). */
export async function deletePlantImage(db: D1Database, sceneId: string, imageId: string): Promise<string | null> {
  const row = await db.prepare(
    "SELECT r2_key FROM garden_scene_images_v2 WHERE id = ? AND scene_id = ? AND kind = 'plant' LIMIT 1",
  )
    .bind(imageId, sceneId)
    .first<{ r2_key: string }>();
  if (!row) return null;
  await db.prepare('DELETE FROM garden_scene_images_v2 WHERE id = ? AND scene_id = ?').bind(imageId, sceneId).run();
  return row.r2_key;
}

export async function saveAnalysis(
  db: D1Database,
  input: { sceneId: string; imageId: string; mode: AiAnalysis['mode']; model: string; question: string; payload: AiAnalysis['payload'] },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO ai_analyses_v2 (id, scene_id, image_id, mode, model, question, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, input.sceneId, input.imageId, input.mode, input.model, input.question, JSON.stringify(input.payload), nowIso())
    .run();
  return id;
}

export async function listAnalyses(db: D1Database, sceneId: string): Promise<AiAnalysis[]> {
  const rows = await db.prepare(
    `SELECT id, scene_id, image_id, mode, model, response_json, created_at
     FROM ai_analyses_v2 WHERE scene_id = ? ORDER BY created_at DESC`,
  )
    .bind(sceneId)
    .all<{ id: string; scene_id: string; image_id: string; mode: AiAnalysis['mode']; model: string; response_json: string; created_at: string }>();
  return (rows.results ?? []).flatMap((row) => {
    try {
      return [{ id: row.id, sceneId: row.scene_id, imageId: row.image_id, mode: row.mode, model: row.model, createdAt: row.created_at, payload: JSON.parse(row.response_json) }];
    } catch {
      return [];
    }
  });
}

export async function getScene(db: D1Database, userId: string, sceneId: string): Promise<GardenScene | null> {
  const scene = await ownedScene(db, userId, sceneId);
  if (!scene) return null;
  const [profile, images, identifications, analyses] = await Promise.all([
    getProfile(db, sceneId),
    listImages(db, sceneId),
    listIdentifications(db, sceneId),
    listAnalyses(db, sceneId),
  ]);
  return {
    id: scene.id,
    title: scene.title,
    notes: scene.notes,
    createdAt: scene.created_at,
    updatedAt: scene.updated_at,
    profile,
    images,
    identifications,
    analyses,
  };
}

export async function deleteScene(db: D1Database, userId: string, sceneId: string): Promise<string[] | null> {
  const scene = await ownedScene(db, userId, sceneId);
  if (!scene) return null;
  const keys = await db.prepare(
    'SELECT r2_key FROM garden_scene_images_v2 WHERE scene_id = ? AND deleted_at IS NULL',
  )
    .bind(sceneId)
    .all<{ r2_key: string }>();
  await db.prepare('DELETE FROM garden_scenes_v2 WHERE id = ? AND user_id = ?').bind(sceneId, userId).run();
  return (keys.results ?? []).map((row) => row.r2_key);
}
