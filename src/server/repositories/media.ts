import type { MediaItem } from '../../shared/types';
import { nowIso } from '../utils/time';

interface MediaRow {
  id: string;
  garden_id: string;
  feature_id: string | null;
  r2_key: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

function mapMedia(row: MediaRow): MediaItem {
  return {
    id: row.id,
    gardenId: row.garden_id,
    featureId: row.feature_id,
    originalFilename: row.original_filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    note: row.note ?? '',
    latitude: row.latitude,
    longitude: row.longitude,
    createdAt: row.created_at,
    contentUrl: `/api/media/${row.id}/content`,
  };
}

export async function createMediaRecord(
  db: D1Database,
  input: {
    userId: string;
    gardenId: string;
    featureId: string | null;
    r2Key: string;
    originalFilename: string;
    contentType: string;
    sizeBytes: number;
    note: string;
    latitude: number | null;
    longitude: number | null;
  },
): Promise<MediaItem> {
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO media
         (id, user_id, r2_key, original_filename, content_type, size_bytes, note, latitude, longitude, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.userId,
        input.r2Key,
        input.originalFilename,
        input.contentType,
        input.sizeBytes,
        input.note || null,
        input.latitude,
        input.longitude,
        timestamp,
      ),
    db
      .prepare(
        `INSERT INTO media_links (media_id, garden_id, feature_id, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(id, input.gardenId, input.featureId, timestamp),
  ]);

  return {
    id,
    gardenId: input.gardenId,
    featureId: input.featureId,
    originalFilename: input.originalFilename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    note: input.note,
    latitude: input.latitude,
    longitude: input.longitude,
    createdAt: timestamp,
    contentUrl: `/api/media/${id}/content`,
  };
}

export async function listMedia(
  db: D1Database,
  userId: string,
  gardenId?: string,
): Promise<MediaItem[]> {
  const query = gardenId
    ? `SELECT m.id, ml.garden_id, ml.feature_id, m.r2_key, m.original_filename, m.content_type,
              m.size_bytes, m.note, m.latitude, m.longitude, m.created_at
       FROM media m JOIN media_links ml ON ml.media_id = m.id
       WHERE m.user_id = ? AND ml.garden_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC`
    : `SELECT m.id, ml.garden_id, ml.feature_id, m.r2_key, m.original_filename, m.content_type,
              m.size_bytes, m.note, m.latitude, m.longitude, m.created_at
       FROM media m JOIN media_links ml ON ml.media_id = m.id
       WHERE m.user_id = ? AND m.deleted_at IS NULL
       ORDER BY m.created_at DESC`;

  const statement = gardenId ? db.prepare(query).bind(userId, gardenId) : db.prepare(query).bind(userId);
  const rows = await statement.all<MediaRow>();
  return rows.results.map(mapMedia);
}

export async function getMediaForUser(
  db: D1Database,
  userId: string,
  mediaId: string,
): Promise<MediaRow | null> {
  return (
    (await db
      .prepare(
        `SELECT m.id, ml.garden_id, ml.feature_id, m.r2_key, m.original_filename, m.content_type,
                m.size_bytes, m.note, m.latitude, m.longitude, m.created_at
         FROM media m JOIN media_links ml ON ml.media_id = m.id
         WHERE m.id = ? AND m.user_id = ? AND m.deleted_at IS NULL LIMIT 1`,
      )
      .bind(mediaId, userId)
      .first<MediaRow>()) ?? null
  );
}

export async function deleteMediaRecord(
  db: D1Database,
  userId: string,
  mediaId: string,
): Promise<{ deleted: boolean; r2Key: string | null }> {
  const row = await getMediaForUser(db, userId, mediaId);
  if (!row) return { deleted: false, r2Key: null };
  const result = await db
    .prepare('UPDATE media SET deleted_at = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
    .bind(nowIso(), mediaId, userId)
    .run();
  return { deleted: (result.meta.changes ?? 0) === 1, r2Key: row.r2_key };
}
