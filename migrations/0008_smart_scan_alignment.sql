ALTER TABLE smart_scan_sessions ADD COLUMN alignment_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE smart_scan_sessions ADD COLUMN alignment_status TEXT NOT NULL DEFAULT 'unplaced'
  CHECK (alignment_status IN ('unplaced', 'draft', 'aligned'));
