PRAGMA foreign_keys = ON;

CREATE TABLE capture_sessions (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  target_feature_id TEXT REFERENCES garden_features(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'perimeter' CHECK (mode IN ('perimeter', 'panorama', 'zone')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  target_overlap_percent INTEGER NOT NULL DEFAULT 35 CHECK (target_overlap_percent BETWEEN 15 AND 70),
  current_sequence INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX capture_sessions_garden_idx ON capture_sessions(garden_id, status, created_at DESC);

CREATE TABLE capture_frames (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL UNIQUE REFERENCES media(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL,
  latitude REAL,
  longitude REAL,
  accuracy_m REAL,
  bearing_degrees REAL,
  overlap_percent REAL,
  distance_from_previous_m REAL,
  bearing_delta_degrees REAL,
  quality_status TEXT NOT NULL DEFAULT 'review' CHECK (quality_status IN ('good', 'review', 'retake')),
  quality_messages_json TEXT NOT NULL DEFAULT '[]',
  captured_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, sequence_no)
);
CREATE INDEX capture_frames_session_idx ON capture_frames(session_id, sequence_no);
