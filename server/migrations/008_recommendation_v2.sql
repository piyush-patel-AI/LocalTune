-- Migration 008: Recommendation V2 telemetry (legacy SQLite/Turso runner mirror)
-- AWS-feedback: identical intent to supabase/migrations/003_recommendation_v2.sql
-- but written for the SQLite dialect used by migrationManager.js / init-turso.js.
-- Statements are tolerant of pre-existing columns (migrationManager ignores
-- "duplicate column name").

ALTER TABLE play_logs ADD COLUMN play_origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE play_logs ADD COLUMN session_id TEXT;

ALTER TABLE recommendation_logs ADD COLUMN source TEXT;
ALTER TABLE recommendation_logs ADD COLUMN recommendation_surface TEXT DEFAULT 'generic';
ALTER TABLE recommendation_logs ADD COLUMN session_id TEXT;
ALTER TABLE recommendation_logs ADD COLUMN current_track_id INTEGER;
ALTER TABLE recommendation_logs ADD COLUMN position_in_queue INTEGER;
ALTER TABLE recommendation_logs ADD COLUMN listened_seconds REAL;
ALTER TABLE recommendation_logs ADD COLUMN completion_ratio REAL;
ALTER TABLE recommendation_logs ADD COLUMN is_skip BOOLEAN DEFAULT 0;
ALTER TABLE recommendation_logs ADD COLUMN is_replay BOOLEAN DEFAULT 0;
ALTER TABLE recommendation_logs ADD COLUMN favorited BOOLEAN DEFAULT 0;

ALTER TABLE tracks ADD COLUMN last_skipped_at DATETIME;
ALTER TABLE tracks ADD COLUMN total_skip_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_play_logs_user_timestamp ON play_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_play_logs_user_track ON play_logs (user_id, track_id);
CREATE INDEX IF NOT EXISTS idx_rec_logs_user_timestamp ON recommendation_logs (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rec_logs_user_track_action ON recommendation_logs (user_id, track_id, action);
CREATE INDEX IF NOT EXISTS idx_song_transitions_user_from_time ON song_transitions (user_id, from_track_id, last_transition_time DESC);