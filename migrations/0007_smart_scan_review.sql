CREATE TABLE smart_scan_sessions (
  id TEXT PRIMARY KEY,
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  coordinate_frame TEXT NOT NULL DEFAULT 'legacy-arcore-world',
  bounds_json TEXT NOT NULL DEFAULT '{}',
  draft_features_json TEXT NOT NULL DEFAULT '[]',
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'reviewing', 'reviewed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (garden_id, session_id)
);

CREATE INDEX idx_smart_scan_sessions_garden_updated
  ON smart_scan_sessions(garden_id, updated_at DESC);

CREATE TABLE smart_scan_feature_reviews (
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'rejected')),
  type_override TEXT,
  footprint_json TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (garden_id, session_id, feature_id)
);

CREATE INDEX idx_smart_scan_feature_reviews_session
  ON smart_scan_feature_reviews(garden_id, session_id);

CREATE TABLE smart_scan_vision_cache (
  garden_id TEXT NOT NULL REFERENCES gardens(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  classifications_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (garden_id, session_id)
);
