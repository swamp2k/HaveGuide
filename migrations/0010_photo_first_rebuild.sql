PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_identity_time_idx ON login_attempts(identity_hash, attempted_at);

CREATE TABLE garden_scenes_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX garden_scenes_v2_user_idx ON garden_scenes_v2(user_id, updated_at DESC);

CREATE TABLE garden_scene_profiles_v2 (
  scene_id TEXT PRIMARY KEY REFERENCES garden_scenes_v2(id) ON DELETE CASCADE,
  sun TEXT CHECK (sun IN ('full_sun','part_sun','shade')),
  moisture TEXT CHECK (moisture IN ('dry','normal','moist','wet')),
  soil TEXT CHECK (soil IN ('sand','loam','clay','mixed','unknown')),
  drainage TEXT CHECK (drainage IN ('fast','normal','slow','unknown')),
  wind TEXT CHECK (wind IN ('sheltered','normal','exposed','unknown')),
  notes TEXT NOT NULL DEFAULT '',
  goals_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE garden_scene_images_v2 (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES garden_scenes_v2(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('scene','plant')),
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX garden_scene_images_v2_scene_idx ON garden_scene_images_v2(scene_id, created_at DESC);

CREATE TABLE plant_identifications_v2 (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES garden_scenes_v2(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL REFERENCES garden_scene_images_v2(id) ON DELETE CASCADE,
  organ TEXT NOT NULL,
  provider TEXT NOT NULL,
  suggestions_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX plant_identifications_v2_scene_idx ON plant_identifications_v2(scene_id, created_at DESC);

CREATE TABLE ai_analyses_v2 (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES garden_scenes_v2(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL REFERENCES garden_scene_images_v2(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('overview','ideas','problem')),
  model TEXT NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_analyses_v2_scene_idx ON ai_analyses_v2(scene_id, created_at DESC);
