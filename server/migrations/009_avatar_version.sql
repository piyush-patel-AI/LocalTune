-- Migration 009: Add avatar_version to users for avatar cache invalidation.
-- Mirrors supabase/migrations/004_avatar_version.sql for the legacy SQLite
-- migration manager path. The migration manager tolerates duplicate column
-- errors, so this is safe on databases whose users table already gained the
-- column via the consolidated initial schema.
ALTER TABLE users ADD COLUMN avatar_version INTEGER NOT NULL DEFAULT 0;