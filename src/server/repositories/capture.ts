import type {
  CaptureFrame,
  CaptureQuality,
  CaptureSession,
  CaptureWorkspace,
} from '../../shared/capture-types';
import { nowIso } from '../utils/time';

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

interface FrameInput {
  mediaId: string;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  bearingDegrees: number | null;
  capturedAt?: string;
}

function mapFrame(row: FrameRow): CaptureFrame {
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
  };
}

function mapSession(row: SessionRow, frames: CaptureFrame[]): CaptureSession {
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
  const [sessionsResult, framesResult] = await Promise.all([
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
  ]);

  const framesBySession = new Map<string, CaptureFrame[]>();
  for (const row of framesResult.results) {
    const frames = framesBySession.get(row.session_id) ?? [];
    frames.push(mapFrame(row));
    framesBySession.set(row.session_id, frames);
  }

  const sessions = sessionsResult.results.map((row) =>
    mapSession(row, framesBySession.get(row.id) ?? []));

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
