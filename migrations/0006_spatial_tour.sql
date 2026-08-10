PRAGMA foreign_keys = ON;

CREATE TABLE capture_station_positions (
  session_id TEXT NOT NULL REFERENCES capture_sessions(id) ON DELETE CASCADE,
  station_no INTEGER NOT NULL CHECK (station_no >= 1),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, station_no)
);

CREATE TABLE capture_feature_links (
  frame_id TEXT NOT NULL REFERENCES capture_frames(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES garden_features(id) ON DELETE CASCADE,
  x_norm REAL NOT NULL CHECK (x_norm BETWEEN 0 AND 1),
  y_norm REAL NOT NULL CHECK (y_norm BETWEEN 0 AND 1),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'suggested')),
  confidence TEXT NOT NULL DEFAULT 'confirmed' CHECK (confidence IN ('suggested', 'confirmed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (frame_id, feature_id)
);

CREATE INDEX capture_feature_links_feature_idx ON capture_feature_links(feature_id, frame_id);
