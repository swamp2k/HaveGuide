PRAGMA foreign_keys = ON;

CREATE TABLE garden_walks (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  current_step INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX garden_walks_garden_id_idx ON garden_walks(garden_id);

CREATE TABLE observations (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  feature_id TEXT REFERENCES garden_features(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('plant_note', 'condition', 'problem', 'photo_note')),
  title TEXT NOT NULL,
  notes TEXT,
  latitude REAL,
  longitude REAL,
  bearing_degrees REAL,
  environment_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX observations_garden_id_idx ON observations(garden_id);
CREATE INDEX observations_kind_idx ON observations(garden_id, kind);

CREATE TABLE plants (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  feature_id TEXT REFERENCES garden_features(id) ON DELETE SET NULL,
  common_name TEXT,
  scientific_name TEXT,
  identification_status TEXT NOT NULL DEFAULT 'unidentified'
    CHECK (identification_status IN ('unidentified', 'suggested', 'confirmed', 'manual')),
  confidence TEXT NOT NULL DEFAULT 'unknown'
    CHECK (confidence IN ('certain', 'likely', 'unknown')),
  notes TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX plants_garden_id_idx ON plants(garden_id);
CREATE INDEX plants_scientific_name_idx ON plants(garden_id, scientific_name);

CREATE TABLE plant_media (
  plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  organ TEXT NOT NULL DEFAULT 'auto'
    CHECK (organ IN ('auto', 'leaf', 'flower', 'fruit', 'bark', 'habit', 'other')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (plant_id, media_id)
);
CREATE INDEX plant_media_media_id_idx ON plant_media(media_id);

CREATE TABLE identification_requests (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  plant_id TEXT NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  requested_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX identification_requests_plant_id_idx ON identification_requests(plant_id, requested_at);

CREATE TABLE identification_suggestions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES identification_requests(id) ON DELETE CASCADE,
  scientific_name TEXT NOT NULL,
  common_name TEXT,
  score REAL NOT NULL,
  rank INTEGER NOT NULL,
  gbif_id TEXT,
  raw_json TEXT,
  accepted_at TEXT,
  rejected_at TEXT
);
CREATE INDEX identification_suggestions_request_id_idx ON identification_suggestions(request_id, rank);

CREATE TABLE garden_assessments (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('sun', 'moisture', 'soil', 'slope', 'wind', 'maintenance')),
  value TEXT NOT NULL,
  notes TEXT,
  geometry_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX garden_assessments_garden_id_idx ON garden_assessments(garden_id, category);
