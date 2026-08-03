PRAGMA foreign_keys = ON;

CREATE TABLE garden_tasks (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  feature_id TEXT REFERENCES garden_features(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  season TEXT NOT NULL CHECK (season IN ('spring','summer','autumn','winter','any')),
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','skipped')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','plan','seasonal')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX garden_tasks_garden_idx ON garden_tasks(garden_id, status, due_date);

CREATE TABLE garden_changes (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  feature_id TEXT REFERENCES garden_features(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  occurred_on TEXT NOT NULL,
  before_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  after_media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  cost_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'DKK',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX garden_changes_garden_idx ON garden_changes(garden_id, occurred_on DESC);

CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  design_project_id TEXT REFERENCES design_projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'stk',
  estimated_unit_price_minor INTEGER NOT NULL DEFAULT 0,
  actual_unit_price_minor INTEGER,
  supplier TEXT,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','bought','skipped')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX shopping_items_garden_idx ON shopping_items(garden_id, status);

CREATE TABLE garden_share_links (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  last_viewed_at TEXT
);
CREATE INDEX garden_share_links_garden_idx ON garden_share_links(garden_id, revoked_at);
