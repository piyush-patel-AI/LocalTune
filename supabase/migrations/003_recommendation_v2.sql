-- LocalTune Recommendation V2 migration
--
-- Extends play_logs, recommendation_logs and tracks so the contextual
-- recommendation pipeline can:
--   1. distinguish play origin/intention (manual vs autoplay vs queue vs rec)
--   2. attribute outcomes (completion/skip/replay/favorite) to a recommendation
--   3. capture per-impression context (source, surface, session, position)
--   4. enforce skip suppression using per-track skip telemetry
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS) so they are safe to
-- re-run and safe to apply to an existing schema during a rolling upgrade.

-- ============================================================
-- play_logs: intention + session linkage
-- ============================================================
ALTER TABLE play_logs ADD COLUMN IF NOT EXISTS play_origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE play_logs ADD COLUMN IF NOT EXISTS session_id TEXT;

-- ============================================================
-- recommendation_logs: rich impression + outcome attribution
-- ============================================================
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS recommendation_surface TEXT DEFAULT 'generic';
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS current_track_id INTEGER;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS position_in_queue INTEGER;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS listened_seconds DOUBLE PRECISION;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS completion_ratio DOUBLE PRECISION;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS is_skip BOOLEAN DEFAULT FALSE;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS is_replay BOOLEAN DEFAULT FALSE;
ALTER TABLE recommendation_logs ADD COLUMN IF NOT EXISTS favorited BOOLEAN DEFAULT FALSE;

-- ============================================================
-- tracks: skip suppression telemetry for negative feedback
-- ============================================================
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS last_skipped_at TIMESTAMPTZ;
ALTER TABLE tracks ADD COLUMN IF NOT EXISTS total_skip_count INTEGER DEFAULT 0;

-- ============================================================
-- Indexes tuned for the retrieval/ranking read patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_play_logs_user_timestamp
  ON play_logs (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_play_logs_user_track
  ON play_logs (user_id, track_id);

CREATE INDEX IF NOT EXISTS idx_rec_logs_user_timestamp
  ON recommendation_logs (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_rec_logs_user_track_action
  ON recommendation_logs (user_id, track_id, action);

CREATE INDEX IF NOT EXISTS idx_song_transitions_user_from_time
  ON song_transitions (user_id, from_track_id, last_transition_time DESC);