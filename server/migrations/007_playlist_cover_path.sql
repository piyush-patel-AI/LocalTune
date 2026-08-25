-- 007_playlist_cover_path.sql
-- Same convergence class as 006: schema.sql's bootstrap CREATE TABLE playlists
-- predates cover_path, so fresh databases lacked the column that production
-- instances already carry (added historically via migration 001's fuller
-- definition). Databases that already have the column hit a tolerated
-- duplicate-column error while fresh ones receive the column.
ALTER TABLE playlists ADD COLUMN cover_path TEXT;
