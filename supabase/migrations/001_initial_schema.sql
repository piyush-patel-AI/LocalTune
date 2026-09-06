-- LocalTune Supabase PostgreSQL Schema
-- Consolidates: schema.sql + migrations 001-007

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_path   TEXT,
  avatar_version INTEGER NOT NULL DEFAULT 0,
  date_created  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: tracks (28 columns — the largest table)
-- ============================================================
CREATE TABLE IF NOT EXISTS tracks (
  id                     SERIAL PRIMARY KEY,
  file_path              TEXT UNIQUE NOT NULL,
  title                  TEXT NOT NULL,
  artist                 TEXT NOT NULL,
  album                  TEXT NOT NULL,
  duration_seconds       INTEGER DEFAULT 0,
  format                 TEXT NOT NULL,
  file_size              INTEGER DEFAULT 0,
  release_type           TEXT DEFAULT 'album',
  date_added             TIMESTAMPTZ DEFAULT NOW(),
  date_modified          TIMESTAMPTZ NOT NULL,
  -- Metadata fields (migration 002)
  genre                  TEXT,
  year                   INTEGER,
  language               TEXT,
  composer               TEXT,
  comment                TEXT,
  rating                 INTEGER,
  tags                   TEXT,
  -- Original metadata tracking (migration 002)
  original_title         TEXT,
  original_artist        TEXT,
  original_album         TEXT,
  original_genre         TEXT,
  original_year          INTEGER,
  -- Recommendation tracking (migration 002)
  metadata_updated_at    TIMESTAMPTZ,
  last_recommended_at    TIMESTAMPTZ,
  recommendation_count   INTEGER DEFAULT 0,
  -- Storage keys (migration 005)
  b2_key                 TEXT,
  artwork_b2_key         TEXT,
  -- Cover art (migration 001, 006)
  cover_art_path         TEXT
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks (artist);
CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks (album);
CREATE INDEX IF NOT EXISTS idx_tracks_genre ON tracks (genre);
CREATE INDEX IF NOT EXISTS idx_tracks_release_type ON tracks (release_type);
CREATE INDEX IF NOT EXISTS idx_tracks_title_artist ON tracks (LOWER(TRIM(title)), LOWER(TRIM(artist)));

-- ============================================================
-- TABLE: playlists
-- ============================================================
CREATE TABLE IF NOT EXISTS playlists (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  cover_path  TEXT,
  date_created TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: playlist_tracks
-- ============================================================
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON playlist_tracks (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON playlist_tracks (track_id);

-- ============================================================
-- TABLE: favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  date_added TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_track_id ON favorites (track_id);

-- ============================================================
-- TABLE: artist_images
-- ============================================================
CREATE TABLE IF NOT EXISTS artist_images (
  artist_name TEXT PRIMARY KEY,
  image_path  TEXT NOT NULL,
  b2_key      TEXT
);

-- ============================================================
-- TABLE: play_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS play_logs (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id          INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  listened_seconds  DOUBLE PRECISION NOT NULL,
  duration_seconds  DOUBLE PRECISION NOT NULL,
  completion_ratio  DOUBLE PRECISION NOT NULL,
  is_skip           BOOLEAN DEFAULT FALSE,
  is_replay         BOOLEAN DEFAULT FALSE,
  hour_of_day       INTEGER NOT NULL,
  timestamp         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_play_logs_user_id ON play_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_play_logs_track_id ON play_logs (track_id);

-- ============================================================
-- TABLE: song_transitions
-- ============================================================
CREATE TABLE IF NOT EXISTS song_transitions (
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_track_id         INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  to_track_id           INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  transition_count      INTEGER DEFAULT 1,
  last_transition_time  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, from_track_id, to_track_id)
);

-- ============================================================
-- TABLE: recommendation_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS recommendation_logs (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id           INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  shelf_id           TEXT NOT NULL,
  action             TEXT NOT NULL,
  algorithm_version  TEXT DEFAULT 'v1',
  timestamp          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: schema_migrations (tracks which SQL files have been applied)
-- ============================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  id         SERIAL PRIMARY KEY,
  filename   TEXT UNIQUE NOT NULL,
  applied_at TIMESTAMPTZ DEFAULT NOW()
);
