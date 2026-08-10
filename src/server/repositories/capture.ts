import type {
  CaptureFrame,
  CaptureHotspot,
  CaptureQuality,
  CaptureSession,
  CaptureStation,
  CaptureWorkspace,
} from '../../shared/capture-types';
import { nowIso } from '../utils/time';

const SHOTS_PER_STATION = 6;

interface SessionRow {
  id: string;
  garden_id: string;
  target_feature_id: string | null;
  title: string;
  mode: CaptureSession['mode'];
  status: CaptureSession['status'];
  target_overlap_percent: number;
  current_sequence: number;
  started_at: string;
  completed_at: string | null;
}

interface FrameRow {
  id: string;
  session_id: string;
  media_id: string;
  sequence_no: number;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  bearing_degrees: number | null;
  overlap_percent: number | null;
  distance_from_previous_m: number | null;
  bearing_delta_degrees: number | null;
  quality_status: CaptureQuality;
  quality_messages_json: string;
  captured_at: string;
  original_filename: string;
}

interface HotspotRow {
  frame_id: string;
  feature_id: string;
  x_norm: number;
  y_norm: number;
  source: CaptureHotspot['source'];
  confidence: CaptureHotspot['confidence'];
}

interface StationPositionRow {
  session_id: string;
  station_no: number;
  latitude: number;
  longitude: number;
}

interface CaptureMediaRow {
  id: string;
  r2_key: string;
}

interface FrameInput {
  mediaId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  bearingDegrees: number | null;
  capturedAt?: string;
}

function mapHotspot(row: HotspotRow): CaptureHotspot {
  return {
    frameId: row.frame_id,
    featureId: row.feature_id,
    xNorm: row.x_norm,
    yNorm: row.y_norm,
    source: row.source,
    confidence: row.confidence,
  };
}

function mapFrame(row: FrameRow, hotspots: CaptureHotspot[] = []): CaptureFrame {
  return {
    id: row.id,
    sessionId: row.session_id,
    mediaId: row.media_id,
    sequenceNo: row.sequence_no,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracyM: row.accuracy_m,
    bearingDegrees: row.bearing_degrees,
    overlapPercent: row.overlap_percent,
    distanceFromPreviousM: row.distance_from_previous_m,
    bearingDeltaDegrees: row.bearing_delta_degrees,
    qualityStatus: row.quality_status,
    qualityMessages: JSON.parse(row.quality_messages_json) as string[],
    capturedAt: row.captured_at,
    contentUrl: `/api/media/${row.media_id}/content`,
    originalFilename: row.original_filename,
    hotspots,
  };
}

function stationNoForSequence(sequenceNo: number): number {
  return Math.floor((sequenceNo - 1) / SHOTS_PER_STATION) + 1;
}

function buildStations(
  frames: CaptureFrame[],
  overrides: Map<number, StationPositionRow>,
): CaptureStation[] {
  const grouped = new Map<number, CaptureFrame[]>();
  for (const frame of frames) {
    const stationNo = stationNoForSequence(frame.sequenceNo);
    const stationFrames = grouped.get(stationNo) ?? [];
    stationFrames.push(frame);
    grouped.set(stationNo, stationFrames);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([stationNo, stationFrames]) => {
      const override = overrides.get(stationNo);
      if (override) {
        return {
          stationNo,
          latitude: override.latitude,
          longitude: override.longitude,
          accuracyM: null,
          source: 'manual' as const,
          frameIds: stationFrames.map((frame) => frame.id),
        };
      }

      const positioned = stationFrames.filter(
        (frame) => frame.latitude !== null && frame.longitude !== null,
      );
      if (positioned.length === 0) {
        return {
          stationNo,
          latitude: null,
          longitude: null,
          accuracyM: null,
          source: 'unknown' as const,
          frameIds: stationFrames.map((frame) => frame.id),
        };
      }

      const latitude = positioned.reduce((sum, frame) => sum + (frame.latitude ?? 0), 0) / positioned.length;
      const longitude = positioned.reduce((sum, frame) => sum + (frame.longitude ?? 0), 0) / positioned.length;
      const accuracies = positioned
        .map((frame) => frame.accuracyM)
        .filter((accuracy): accuracy is number => accuracy !== null);
      const accuracyM = accuracies.length > 0
        ? accuracies.reduce((sum, accuracy) => sum + accuracy, 0) / accuracies.length
        : null;

      return {
        stationNo,
        latitude,
        longitude,
        accuracyM,
        source: 'gps' as const,
        frameIds: stationFrames.map((frame) => frame.id),
      };
    });
}

function mapSession(
  row: SessionRow,
  frames: CaptureFrame[],
  overrides: Map<number, StationPositionRow>,
): CaptureSession {
  return {
    id: row.id,
    gardenId: row.garden_id,
    targetFeatureId: row.target_feature_id,
    title: row.title,
    mode: row.mode,
    status: row.status,
    targetOverlapPercent: row.target_overlap_percent,
    currentSequence: row.current_sequence,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    frames,
    stations: buildStations(frames, overrides),
  };
}

function degreesDelta(first: number, second: number): number {
  const delta = Math.abs(first - second) % 360;
  return Math.min(delta, 360 - delta);
}

function distanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const radius = 6_371_000;
  const toRadians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const firstLatitude = toRadians(first.latitude);
  const secondLatitude = toRadians(second.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function evaluateFrame(previous: CaptureFrame | null, input: FrameInput): {
  overlapPercent: number | null;
  distanceFromPreviousM: number | null;
  bearingDeltaDegrees: number | null;
  qualityStatus: CaptureQuality;
  qualityMessages: string[];
} {
  const qualityMessages: string[] = [];
  let distanceFromPreviousM: number | null = null;
  let bearingDeltaDegrees: number | null = null;
  let overlapPercent: number | null = null;

  if (input.latitude === null || input.longitude === null) {
    qualityMessages.push('GPS-positionen mangler; billedet kan stadig bruges i rækkefølgen.');
  } else if (input.accuracyM !== null && input.accuracyM > 20) {
    qualityMessages.push(`GPS-nøjagtigheden er cirka ${Math.round(input.accuracyM)} meter.`);
  }

  if (previous) {
    if (
      previous.latitude !== null && previous.longitude !== null &&
      input.latitude !== null && input.longitude !== null
    ) {
      distanceFromPreviousM = distanceMeters(
        { latitude: previous.latitude, longitude: previous.longitude },
        { latitude: input.latitude, longitude: input.longitude },
      );
      if (distanceFromPreviousM > 8) {
        qualityMessages.push(`Du flyttede dig cirka ${Math.round(distanceFromPreviousM)} meter siden sidste billede.`);
      }
    }

    if (previous.bearingDegrees !== null && input.bearingDegrees !== null) {
      bearingDeltaDegrees = degreesDelta(previous.bearingDegrees, input.bearingDegrees);
      const estimatedHorizontalFieldOfView = 65;
      overlapPercent = Math.max(
        0,
        Math.min(100, Math.round((1 - bearingDeltaDegrees / estimatedHorizontalFieldOfView) * 100)),
      );
      if (overlapPercent < 20) {
        qualityMessages.push('Der ser ud til at være for lidt overlap med forrige billede.');
      } else if (overlapPercent > 70) {
        qualityMessages.push('Billedet peger næsten samme vej som det forrige; drej lidt mere.');
      }
    } else {
      qualityMessages.push('Kompasretningen mangler, så overlap kan ikke kontrolleres automatisk.');
    }
  }

  const qualityStatus: CaptureQuality =
    (overlapPercent !== null && overlapPercent < 10) ||
    (distanceFromPreviousM !== null && distanceFromPreviousM > 20)
      ? 'retake'
      : qualityMessages.length > 0
        ? 'review'
        : 'good';

  return {
    overlapPercent,
    distanceFromPreviousM,
    bearingDeltaDegrees,
    qualityStatus,
    qualityMessages,
  };
}

export async function getCaptureWorkspace(
  db: D1Database,
  gardenId: string,
  aerialAvailable: boolean,
): Promise<CaptureWorkspace> {
  const [sessionsResult, framesResult, hotspotsResult, stationPositionsResult] = await Promise.all([
    db.prepare(`SELECT id, garden_id, target_feature_id, title, mode, status,
      target_overlap_percent, current_sequence, started_at, completed_at
      FROM capture_sessions WHERE garden_id = ? ORDER BY created_at DESC`)
      .bind(gardenId).all<SessionRow>(),
    db.prepare(`SELECT f.id, f.session_id, f.media_id, f.sequence_no, f.latitude, f.longitude,
      f.accuracy_m, f.bearing_degrees, f.overlap_percent, f.distance_from_previous_m,
      f.bearing_delta_degrees, f.quality_status, f.quality_messages_json, f.captured_at,
      m.original_filename
      FROM capture_frames f
      JOIN capture_sessions s ON s.id = f.session_id
      JOIN media m ON m.id = f.media_id
      WHERE s.garden_id = ? AND m.deleted_at IS NULL
      ORDER BY s.created_at DESC, f.sequence_no`)
      .bind(gardenId).all<FrameRow>(),
    db.prepare(`SELECT l.frame_id, l.feature_id, l.x_norm, l.y_norm, l.source, l.confidence
      FROM capture_feature_links l
      JOIN capture_frames f ON f.id = l.frame_id
      JOIN capture_sessions s ON s.id = f.session_id
      WHERE s.garden_id = ?`)
      .bind(gardenId).all<HotspotRow>(),
    db.prepare(`SELECT p.session_id, p.station_no, p.latitude, p.longitude
      FROM capture_station_positions p
      JOIN capture_sessions s ON s.id = p.session_id
      WHERE s.garden_id = ?`)
      .bind(gardenId).all<StationPositionRow>(),
  ]);

  const hotspotsByFrame = new Map<string, CaptureHotspot[]>();
  for (const row of hotspotsResult.results) {
    const hotspots = hotspotsByFrame.get(row.frame_id) ?? [];
    hotspots.push(mapHotspot(row));
    hotspotsByFrame.set(row.frame_id, hotspots);
  }

  const framesBySession = new Map<string, CaptureFrame[]>();
  for (const row of framesResult.results) {
    const frames = framesBySession.get(row.session_id) ?? [];
    frames.push(mapFrame(row, hotspotsByFrame.get(row.id) ?? []));
    framesBySession.set(row.session_id, frames);
  }

  const stationOverridesBySession = new Map<string, Map<number, StationPositionRow>>();
  for (const row of stationPositionsResult.results) {
    const stationMap = stationOverridesBySession.get(row.session_id) ?? new Map<number, StationPositionRow>();
    stationMap.set(row.station_no, row);
    stationOverridesBySession.set(row.session_id, stationMap);
  }

  const sessions = sessionsResult.results.map((row) =>
    mapSession(
      row,
      framesBySession.get(row.id) ?? [],
      stationOverridesBySession.get(row.id) ?? new Map<number, StationPositionRow>(),
    ));

  return {
    activeSession: sessions.find((session) => session.status === 'active') ?? null,
    sessions,
    aerialAvailable,
    aerialProvider: aerialAvailable ? 'GeoDanmark Ortofoto forår' : null,
  };
}

export async function createCaptureSession(
  db: D1Database,
  gardenId: string,
  input: {
    title: string;
    mode: CaptureSession['mode'];
    targetFeatureId?: string;
    targetOverlapPercent: number;
  },
): Promise<string> {
  const existing = await db.prepare(`SELECT id FROM capture_sessions
    WHERE garden_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`)
    .bind(gardenId).first<{ id: string }>();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  const timestamp = nowIso();
  await db.prepare(`INSERT INTO capture_sessions
    (id, garden_id, target_feature_id, title, mode, status, target_overlap_percent,
     current_sequence, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, 0, ?, ?, ?)`)
    .bind(
      id,
      gardenId,
      input.targetFeatureId ?? null,
      input.title,
      input.mode,
      input.targetOverlapPercent,
      timestamp,
      timestamp,
      timestamp,
    ).run();
  return id;
}

export async function mediaBelongsToGarden(
  db: D1Database,
  userId: string,
  gardenId: string,
  mediaId: string,
): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS found FROM media m
    JOIN media_links ml ON ml.media_id = m.id
    WHERE m.id = ? AND m.user_id = ? AND ml.garden_id = ? AND m.deleted_at IS NULL LIMIT 1`)
    .bind(mediaId, userId, gardenId).first<{ found: number }>();
  return row?.found === 1;
}

export async function addCaptureFrame(
  db: D1Database,
  gardenId: string,
  sessionId: string,
  input: FrameInput,
): Promise<boolean> {
  const session = await db.prepare(`SELECT id, current_sequence FROM capture_sessions
    WHERE id = ? AND garden_id = ? AND status = 'active' LIMIT 1`)
    .bind(sessionId, gardenId).first<{ id: string; current_sequence: number }>();
  if (!session) return false;

  const previousRow = await db.prepare(`SELECT f.id, f.session_id, f.media_id, f.sequence_no,
    f.latitude, f.longitude, f.accuracy_m, f.bearing_degrees, f.overlap_percent,
    f.distance_from_previous_m, f.bearing_delta_degrees, f.quality_status,
    f.quality_messages_json, f.captured_at, m.original_filename
    FROM capture_frames f JOIN media m ON m.id = f.media_id
    WHERE f.session_id = ? ORDER BY f.sequence_no DESC LIMIT 1`)
    .bind(sessionId).first<FrameRow>();
  const previous = previousRow ? mapFrame(previousRow) : null;
  const evaluation = evaluateFrame(previous, input);
  const sequenceNo = session.current_sequence + 1;
  const timestamp = nowIso();

  await db.batch([
    db.prepare(`INSERT INTO capture_frames
      (id, session_id, media_id, sequence_no, latitude, longitude, accuracy_m,
       bearing_degrees, overlap_percent, distance_from_previous_m, bearing_delta_degrees,
       quality_status, quality_messages_json, captured_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        sessionId,
        input.mediaId,
        sequenceNo,
        input.latitude,
        input.longitude,
        input.accuracyM,
        input.bearingDegrees,
        evaluation.overlapPercent,
        evaluation.distanceFromPreviousM,
        evaluation.bearingDeltaDegrees,
        evaluation.qualityStatus,
        JSON.stringify(evaluation.qualityMessages),
        input.capturedAt ?? timestamp,
        timestamp,
      ),
    db.prepare(`UPDATE capture_sessions SET current_sequence = ?, updated_at = ?
      WHERE id = ? AND garden_id = ?`)
      .bind(sequenceNo, timestamp, sessionId, gardenId),
  ]);
  return true;
}

export async function finishCaptureSession(
  db: D1Database,
  gardenId: string,
  sessionId: string,
  status: 'completed' | 'cancelled',
): Promise<boolean> {
  const timestamp = nowIso();
  const result = await db.prepare(`UPDATE capture_sessions
    SET status = ?, completed_at = ?, updated_at = ?
    WHERE id = ? AND garden_id = ? AND status = 'active'`)
    .bind(status, timestamp, timestamp, sessionId, gardenId).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function updateCaptureStationPosition(
  db: D1Database,
  gardenId: string,
  sessionId: string,
  stationNo: number,
  latitude: number,
  longitude: number,
): Promise<boolean> {
  const firstSequence = (stationNo - 1) * SHOTS_PER_STATION + 1;
  const lastSequence = stationNo * SHOTS_PER_STATION;
  const stationExists = await db.prepare(`SELECT 1 AS found
    FROM capture_frames f
    JOIN capture_sessions s ON s.id = f.session_id
    WHERE s.id = ? AND s.garden_id = ? AND f.sequence_no BETWEEN ? AND ? LIMIT 1`)
    .bind(sessionId, gardenId, firstSequence, lastSequence)
    .first<{ found: number }>();
  if (stationExists?.found !== 1) return false;

  const timestamp = nowIso();
  await db.prepare(`INSERT INTO capture_station_positions
    (session_id, station_no, latitude, longitude, source, updated_at)
    VALUES (?, ?, ?, ?, 'manual', ?)
    ON CONFLICT(session_id, station_no) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      source = 'manual',
      updated_at = excluded.updated_at`)
    .bind(sessionId, stationNo, latitude, longitude, timestamp)
    .run();
  return true;
}

export async function upsertCaptureHotspot(
  db: D1Database,
  gardenId: string,
  sessionId: string,
  frameId: string,
  featureId: string,
  xNorm: number,
  yNorm: number,
): Promise<boolean> {
  const frame = await db.prepare(`SELECT 1 AS found
    FROM capture_frames f
    JOIN capture_sessions s ON s.id = f.session_id
    WHERE f.id = ? AND s.id = ? AND s.garden_id = ? LIMIT 1`)
    .bind(frameId, sessionId, gardenId)
    .first<{ found: number }>();
  if (frame?.found !== 1) return false;

  const timestamp = nowIso();
  await db.prepare(`INSERT INTO capture_feature_links
    (frame_id, feature_id, x_norm, y_norm, source, confidence, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'manual', 'confirmed', ?, ?)
    ON CONFLICT(frame_id, feature_id) DO UPDATE SET
      x_norm = excluded.x_norm,
      y_norm = excluded.y_norm,
      source = 'manual',
      confidence = 'confirmed',
      updated_at = excluded.updated_at`)
    .bind(frameId, featureId, xNorm, yNorm, timestamp, timestamp)
    .run();
  return true;
}

export async function deleteCaptureHotspot(
  db: D1Database,
  gardenId: string,
  sessionId: string,
  frameId: string,
  featureId: string,
): Promise<boolean> {
  const frame = await db.prepare(`SELECT 1 AS found
    FROM capture_frames f
    JOIN capture_sessions s ON s.id = f.session_id
    WHERE f.id = ? AND s.id = ? AND s.garden_id = ? LIMIT 1`)
    .bind(frameId, sessionId, gardenId)
    .first<{ found: number }>();
  if (frame?.found !== 1) return false;

  const result = await db.prepare(`DELETE FROM capture_feature_links
    WHERE frame_id = ? AND feature_id = ?`)
    .bind(frameId, featureId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function resetCaptureWorkspace(
  db: D1Database,
  userId: string,
  gardenId: string,
): Promise<{ deletedImages: number; r2Keys: string[] }> {
  const mediaResult = await db.prepare(`SELECT DISTINCT m.id, m.r2_key
    FROM media m
    JOIN capture_frames f ON f.media_id = m.id
    JOIN capture_sessions s ON s.id = f.session_id
    WHERE s.garden_id = ? AND m.user_id = ? AND m.deleted_at IS NULL`)
    .bind(gardenId, userId)
    .all<CaptureMediaRow>();

  const timestamp = nowIso();
  await db.batch([
    db.prepare(`UPDATE media SET deleted_at = ?
      WHERE user_id = ? AND deleted_at IS NULL AND id IN (
        SELECT f.media_id FROM capture_frames f
        JOIN capture_sessions s ON s.id = f.session_id
        WHERE s.garden_id = ?
      )`)
      .bind(timestamp, userId, gardenId),
    db.prepare('DELETE FROM capture_sessions WHERE garden_id = ?')
      .bind(gardenId),
  ]);

  return {
    deletedImages: mediaResult.results.length,
    r2Keys: mediaResult.results.map((row) => row.r2_key),
  };
}
