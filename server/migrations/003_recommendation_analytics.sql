-- Migration 003: Recommendation Analytics & Engagement Logging

CREATE TABLE IF NOT EXISTS recommendation_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  shelf_id TEXT NOT NULL,
  action TEXT NOT NULL, -- 'shown', 'clicked', 'played', 'completed', 'skipped', 'liked'
  algorithm_version TEXT DEFAULT 'v1',
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
