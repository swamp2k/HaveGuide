-- AI "what could this look like" edits of a scene photo.
--
-- Visualizations keep their own R2 key rather than reusing garden_scene_images_v2. Widening that
-- table's kind CHECK constraint would mean a full table rebuild, and dropping the old table with
-- foreign keys enabled fires ON DELETE CASCADE into plant_identifications_v2 and ai_analyses_v2.
-- This migration is purely additive and cannot touch existing rows.

CREATE TABLE scene_visualizations_v2 (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL REFERENCES garden_scenes_v2(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_image_id TEXT NOT NULL REFERENCES garden_scene_images_v2(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  instruction TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX scene_visualizations_v2_scene_idx ON scene_visualizations_v2(scene_id, created_at DESC);
