ALTER TABLE garden_features ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE garden_features ADD COLUMN source_session_id TEXT;
ALTER TABLE garden_features ADD COLUMN source_feature_id TEXT;

CREATE INDEX idx_garden_features_source
  ON garden_features(garden_id, source_kind, source_session_id, source_feature_id);
