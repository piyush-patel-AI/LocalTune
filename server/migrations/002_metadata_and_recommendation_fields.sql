-- Migration 002: Add metadata and recommendation tracking fields

-- Future-proof metadata columns
ALTER TABLE tracks ADD COLUMN genre TEXT;
ALTER TABLE tracks ADD COLUMN year INTEGER;
ALTER TABLE tracks ADD COLUMN language TEXT;
ALTER TABLE tracks ADD COLUMN composer TEXT;
ALTER TABLE tracks ADD COLUMN comment TEXT;
ALTER TABLE tracks ADD COLUMN rating INTEGER;
ALTER TABLE tracks ADD COLUMN tags TEXT;

-- Original metadata tracking for reset capability
ALTER TABLE tracks ADD COLUMN original_title TEXT;
ALTER TABLE tracks ADD COLUMN original_artist TEXT;
ALTER TABLE tracks ADD COLUMN original_album TEXT;
ALTER TABLE tracks ADD COLUMN original_genre TEXT;
ALTER TABLE tracks ADD COLUMN original_year INTEGER;

-- Recommendation & timestamps tracking
ALTER TABLE tracks ADD COLUMN metadata_updated_at DATETIME;
ALTER TABLE tracks ADD COLUMN last_recommended_at DATETIME;
ALTER TABLE tracks ADD COLUMN recommendation_count INTEGER DEFAULT 0;
