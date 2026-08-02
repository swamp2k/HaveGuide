PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE login_attempts (
  id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL,
  attempted_at TEXT NOT NULL
);

CREATE INDEX login_attempts_identity_time_idx ON login_attempts(identity_hash, attempted_at);

CREATE TABLE gardens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  center_lat REAL NOT NULL,
  center_lng REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX gardens_user_id_idx ON gardens(user_id);

CREATE TABLE garden_features (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  confidence TEXT NOT NULL DEFAULT 'unknown',
  geometry_type TEXT NOT NULL,
  geometry_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE INDEX garden_features_garden_id_idx ON garden_features(garden_id);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  note TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX media_user_id_idx ON media(user_id);

CREATE TABLE media_links (
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  feature_id TEXT REFERENCES garden_features(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (media_id, garden_id)
);

CREATE INDEX media_links_garden_id_idx ON media_links(garden_id);
CREATE INDEX media_links_feature_id_idx ON media_links(feature_id);
