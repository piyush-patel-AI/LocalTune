-- Migration 004: Add avatar_version to users for avatar cache invalidation.
-- Each successful avatar (re)upload bumps this counter, and the server returns
-- it in avatarUrl (?v=N) so browsers/WebViews fetch fresh bytes instead of the
-- stale immutable-cached image. The column default 0 keeps the layout backward
-- compatible (avatar = null until the first upload).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_version INTEGER NOT NULL DEFAULT 0;