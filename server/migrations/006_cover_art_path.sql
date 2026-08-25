-- 006_cover_art_path.sql
-- Converges fresh databases with the production shape: schema.sql's bootstrap
-- CREATE TABLE tracks predates cover_art_path, so databases created after that
-- drift were missing the column even though migration 001's fuller definition
-- (CREATE TABLE IF NOT EXISTS) never re-ran. Databases that already have the
-- column (all production instances) hit a tolerated "duplicate column name".
ALTER TABLE tracks ADD COLUMN cover_art_path TEXT;
