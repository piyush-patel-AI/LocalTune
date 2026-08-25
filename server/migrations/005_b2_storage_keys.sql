-- Migration 005: Add B2 object key columns for cloud media storage
-- file_path remains but now stores the B2 key string instead of a local disk path

ALTER TABLE tracks ADD COLUMN b2_key TEXT;
ALTER TABLE tracks ADD COLUMN artwork_b2_key TEXT;

ALTER TABLE artist_images ADD COLUMN b2_key TEXT;
