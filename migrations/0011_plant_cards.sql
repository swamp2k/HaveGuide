-- Plant identifications become first-class "plant cards" on a scene.
ALTER TABLE plant_identifications_v2 ADD COLUMN nickname TEXT NOT NULL DEFAULT '';
ALTER TABLE plant_identifications_v2 ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE plant_identifications_v2 ADD COLUMN include_in_analysis INTEGER NOT NULL DEFAULT 1;
ALTER TABLE plant_identifications_v2 ADD COLUMN selected_suggestion_index INTEGER NOT NULL DEFAULT 0;
ALTER TABLE plant_identifications_v2 ADD COLUMN updated_at TEXT;
