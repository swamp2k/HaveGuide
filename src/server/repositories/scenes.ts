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

export async function saveIdentification(
  db: D1Database,
  sceneId: string,
  imageId: string,
  organ: string,
  suggestions: PlantSuggestion[],
): Promise<string> {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO plant_identifications_v2 (id, scene_id, image_id, organ, provider, suggestions_json, created_at)
     VALUES (?, ?, ?, ?, 'plantnet', ?, ?)`,
  )
    .bind(id, sceneId, imageId, organ, JSON.stringify(suggestions), nowIso())
    .run();
  return id;
}

export async function listIdentifications(db: D1Database, sceneId: string): Promise<PlantIdentification[]> {
  const rows = await db.prepare(
    `SELECT id, scene_id, image_id, organ, suggestions_json, created_at
     FROM plant_identifications_v2 WHERE scene_id = ? ORDER BY created_at DESC`,
  )
    .bind(sceneId)
    .all<{ id: string; scene_id: string; image_id: string; organ: PlantIdentification['organ']; suggestions_json: string; created_at: string }>();
  return (rows.results ?? []).map((row) => {
    let suggestions: PlantSuggestion[] = [];
    try { suggestions = JSON.parse(row.suggestions_json) as PlantSuggestion[]; } catch { suggestions = []; }
    return { id: row.id, sceneId: row.scene_id, imageId: row.image_id, organ: row.organ, createdAt: row.created_at, suggestions };
  });
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
