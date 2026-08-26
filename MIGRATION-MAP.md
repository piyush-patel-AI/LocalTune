# LocalTune Migration Map: Turso/B2/Render → Supabase

## Architecture Overview

**Current:** Express server on Render → Turso (SQLite) + B2 (S3-compatible storage)
**Target:** Supabase PostgreSQL + Storage + Edge Functions (thin Express API layer retained for complex logic)

The recommendation engine, genre normalizer, and most route handlers are too complex for edge functions. The migration strategy retains an Express API server (deployed on Railway/Fly.io/Deno Deploy) backed by Supabase PostgreSQL directly, while Supabase Storage replaces B2. Only trivially stateless public endpoints become Edge Functions.

---

## 1. COMPLETE ROUTE CLASSIFICATION

### 1A. Edge Functions (7 routes — stateless public, no session needed)

These are pure public endpoints with no auth state and no complex logic. Deploy as Supabase Edge Functions for global CDN edge latency.

| Method | Route | Source File | Notes |
|--------|-------|-------------|-------|
| GET | `/api/health` | `index.js:121` | Returns `{status:'ok'}`. Trivial healthcheck. |
| GET | `/api/logo` | `index.js:84` | Serves static `Assets/logo.png`. Move to Supabase Storage public object. |
| GET | `/api/playback-state` | `index.js:136` | Returns in-memory state. **Cannot** be edge (stateful). → Retain on server. |
| POST | `/api/playback-state` | `index.js:141` | Sets in-memory state. **Cannot** be edge (stateful). → Retain on server. |
| GET | `/api/tracks/:id/art` (public) | `index.js:94` | Reads DB for artwork_b2_key, 302 redirects. Edge Function can query PG via `@supabase/supabase-js`. |
| GET | `/stream/:trackId` | `routes/stream.js:34` | Looks up track, generates presigned URL, 302 redirects. Edge Function can do this via Supabase Storage signed URLs. |
| GET | `/api/users/public` | `routes/auth.js:31` | Simple DB read, no auth. Edge Function via PG. |

**Revised classification (edge vs. server-retained):**

| Target | Routes |
|--------|--------|
| **Edge Functions** | `GET /api/health`, `GET /api/logo`, `GET /api/users/public`, `GET /api/tracks/:id/art` (public artwork) |
| **Server-retained (Express)** | All 51 remaining routes (auth sessions, protected CRUD, streaming redirect, upload pipeline, scanner, recommendations, uploader portal) |

The session-based auth architecture makes moving protected routes to edge functions impractical without a major auth refactor. The pragmatic target is: **keep Express server, swap DB to PG, swap B2 to Supabase Storage**.

### 1B. Auth Routes (7 routes — all server-retained)

| Method | Route | Handler | Auth | Changes Required |
|--------|-------|---------|------|------------------|
| GET | `/api/users/public` | `routes/auth.js:31` | Public | PG query via `pg` client |
| GET | `/api/users/:id/avatar` | `routes/auth.js:44` | Public | Serve from Supabase Storage (302 redirect or signed URL) |
| POST | `/api/users/avatar` | `routes/auth.js:63` | Session | Upload to Supabase Storage instead of B2 |
| POST | `/api/register` | `routes/auth.js:101` | Public | `bcryptjs` unchanged; PG INSERT with `$1` |
| POST | `/api/login` | `routes/auth.js:135` | Public | `bcryptjs` unchanged; PG SELECT with `$1` |
| POST | `/api/logout` | `routes/auth.js:162` | Session | `req.session.destroy()` unchanged |
| GET | `/api/me` | `routes/auth.js:173` | Session | PG SELECT with `$1` |

### 1C. Protected Tracks Routes (14 routes — all server-retained)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| GET | `/api/tracks` | `routes/tracks.js:198` | PG query, `?` → `$N`, `LIKE` → `ILIKE` |
| GET | `/api/tracks/:id` | `routes/tracks.js:232` | PG query, `$1` |
| GET | `/api/tracks/:id/art` (auth) | `routes/tracks.js:247` | Supabase Storage redirect |
| PATCH | `/api/tracks/:id` | `routes/tracks.js:267` | PG UPDATE, `$N` |
| POST | `/api/tracks/:id/reset-metadata` | `routes/tracks.js:303` | PG UPDATE, `$N` |
| GET | `/api/tracks/artist-image/:artistName` | `routes/tracks.js:216` | Supabase Storage redirect |
| PATCH | `/api/tracks/bulk-edit` | `routes/tracks.js:174` | PG UPDATE with `= ANY($1::int[])` |
| POST | `/api/tracks/scan-missing-metadata` | `routes/tracks.js:162` | PG queries, Supabase Storage download for reparse |
| GET | `/api/tracks/recommendations` | `routes/tracks.js:140` | PG queries, engine unchanged |
| GET | `/api/tracks/recommendations/shelves` | `routes/tracks.js:46` | PG queries, engine unchanged |
| GET | `/api/tracks/recommendations/discovery` | `routes/tracks.js:68` | PG queries, engine unchanged |
| GET | `/api/tracks/recommendations/forgotten` | `routes/tracks.js:82` | PG queries, engine unchanged |
| GET | `/api/tracks/recommendations/autoplay` | `routes/tracks.js:96` | PG queries, engine unchanged |
| POST | `/api/tracks/recommendations/log` | `routes/tracks.js:123` | PG INSERT |

### 1D. Protected Playlists Routes (11 routes)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| GET | `/api/playlists` | `routes/playlists.js:46` | PG query |
| POST | `/api/playlists` | `routes/playlists.js:52` | PG INSERT; cover upload → Supabase Storage |
| GET | `/api/playlists/:id` | `routes/playlists.js:114` | PG query |
| PATCH | `/api/playlists/:id` | `routes/playlists.js:130` | PG UPDATE |
| DELETE | `/api/playlists/:id` | `routes/playlists.js:152` | PG DELETE |
| GET | `/api/playlists/:id/tracks` | `routes/playlists.js:168` | PG query (JOIN) |
| POST | `/api/playlists/:id/tracks` | `routes/playlists.js:183` | PG INSERT |
| DELETE | `/api/playlists/:id/tracks/:trackId` | `routes/playlists.js:201` | PG DELETE |
| PATCH | `/api/playlists/:id/reorder` | `routes/playlists.js:219` | PG batch UPDATE (transaction) |
| POST | `/api/playlists/:id/cover` | `routes/playlists.js:65` | Upload to Supabase Storage |
| GET | `/api/playlists/:id/cover` | `routes/playlists.js:95` | Serve from Supabase Storage |

### 1E. Protected Favorites Routes (3 routes)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| GET | `/api/favorites` | `routes/favorites.js:7` | PG query (JOIN) |
| POST | `/api/favorites/:trackId` | `routes/favorites.js:13` | PG INSERT (ON CONFLICT DO NOTHING) |
| DELETE | `/api/favorites/:trackId` | `routes/favorites.js:29` | PG DELETE |

### 1F. Protected Scan Routes (2 routes)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| GET | `/api/scan/status` | `routes/scan.js:12` | In-memory state — unchanged |
| POST | `/api/scan` | `routes/scan.js:17` | Supabase Storage `list()` replaces B2 `listB2Objects()` |

### 1G. Protected Stats Routes (2 routes)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| GET | `/api/stats` | `routes/stats.js:7` | PG aggregate queries |
| POST | `/api/stats/listen` | `routes/stats.js:23` | PG INSERT into play_logs + song_transitions |

### 1H. Protected Upload (1 route)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| POST | `/api/upload` | `uploader.js:191` | New flow: client → Supabase Storage signed URL → confirm → server PG insert |

### 1I. Stream Route (1 route — public)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| GET | `/stream/:trackId` | `routes/stream.js:34` | Supabase Storage `createSignedUrl()` → 302 redirect |

### 1J. Uploader Portal (7 routes — unauthenticated)

| Method | Route | Handler | Changes Required |
|--------|-------|---------|------------------|
| GET | `/uploader` | `uploader.js:468` (HTML) | Retained on server, uses Supabase Storage |
| POST | `/upload` | `uploader.js:465` | New signed-URL flow |
| POST | `/upload-artist` | `uploader.js:134` | Supabase Storage upload |
| GET | `/api/artists` | `uploader.js:82` | PG query |
| GET | `/api/manage-tracks` | `uploader.js:92` | PG query |
| POST | `/api/manage-tracks/:id` | `uploader.js:102` | PG UPDATE |
| POST | `/api/manage-tracks/:id/reset` | `uploader.js:122` | PG UPDATE |

---

## 2. DATABASE MIGRATION PLAN

### 2A. SQLite → PostgreSQL Type Mappings

| SQLite Type | PostgreSQL Type | Notes |
|-------------|-----------------|-------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | or `GENERATED ALWAYS AS IDENTITY` |
| `INTEGER` (boolean) | `BOOLEAN DEFAULT FALSE` | SQLite uses 0/1; PG uses TRUE/FALSE |
| `REAL` | `DOUBLE PRECISION` | PG's `REAL` is 4-byte float; `DOUBLE PRECISION` = 8-byte |
| `TEXT` | `TEXT` | Same |
| `DATETIME DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMPTZ DEFAULT NOW()` | Prefer timestamptz for timezone safety |
| `?` placeholders | `$1, $2, ...` | pg client positional parameters |
| `LIKE` (case-insensitive in SQLite) | `ILIKE` | PG LIKE is case-sensitive |
| `batch()` API | Transactions | `BEGIN; ... COMMIT;` |
| `PRAGMA foreign_keys` | Remove | PG enforces FK by default |

### 2B. Final PostgreSQL DDL (all tables after all migrations applied)

```sql
-- Supabase PostgreSQL DDL for LocalTune
-- Replaces: schema.sql + migrations 001–007

-- ============================================================
-- TABLE: users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_path   TEXT,
  date_created  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: tracks (28 columns — the largest)
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
  -- Migration 002: metadata fields
  genre                  TEXT,
  year                   INTEGER,
  language               TEXT,
  composer               TEXT,
  comment                TEXT,
  rating                 INTEGER,
  tags                   TEXT,
  original_title         TEXT,
  original_artist        TEXT,
  original_album         TEXT,
  original_genre         TEXT,
  original_year          INTEGER,
  metadata_updated_at    TIMESTAMPTZ,
  last_recommended_at    TIMESTAMPTZ,
  recommendation_count   INTEGER DEFAULT 0,
  -- Migration 005: storage keys
  b2_key                 TEXT,
  artwork_b2_key         TEXT,
  -- Migration 006: cover art
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

-- ============================================================
-- TABLE: favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  track_id   INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  date_added TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, track_id)
);

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

-- Index for play log queries
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
```

### 2C. SQL Translation Rules for Every Query in db.js

| SQLite Pattern | PostgreSQL Equivalent | Files Affected |
|----------------|----------------------|----------------|
| `?` | `$1, $2, $3...` | All functions in `db.js` (35+ queries) |
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | `schema.sql`, `migrationManager.js` |
| `BOOLEAN DEFAULT 0` | `BOOLEAN DEFAULT FALSE` | `play_logs.is_skip`, `play_logs.is_replay` |
| `LIKE ?` (search) | `ILIKE $N` | `getAllTracks()`, search conditions |
| `?` in `IN (...)` | `= ANY($1::int[])` | `bulkUpdateTrackMetadata()` |
| `PRAGMA foreign_keys = ON` | Remove entirely | `db.js:69`, `db.js:105` |
| `batch()` | Transaction (`BEGIN;...COMMIT;`) | `reorderPlaylistTracks()`, `batch` in `db.js:79` |
| `ON CONFLICT(...) DO NOTHING` | Same (PG supports) | `addFavorite()`, `addTrackToPlaylist()` |
| `ON CONFLICT(...) DO UPDATE SET` | Same (PG supports) | `upsertArtistImage()`, `logPlayEvent()` |
| `LAST_INSERT_ROWID` | `RETURNING id` or `currval()` | `createUser()`, `upsertTrack()`, `createPlaylist()` |
| `changes` | `rowcount` on pg client result | All `.run()` callers |
| `CURRENT_TIMESTAMP` | `NOW()` | Timestamp defaults |
| `TRIM(?)` | `TRIM($N)` | `findTrackByTitleAndArtist()` |
| `LOWER(?)` | `LOWER($N)` | Case-insensitive comparisons |
| `err.message.includes('duplicate column name')` | `err.code === '42701'` (PG duplicate_column) | `migrationManager.js:63` |

### 2D. Migration Strategy

**Zero-downtime migration approach:**

1. Create the Supabase PostgreSQL database with the DDL above
2. Write a one-shot migration script (`scripts/migrate-sqlite-to-pg.js`) that:
   - Reads all rows from the SQLite/Turso database
   - Bulk-inserts into PostgreSQL using `pg COPY` or batched `INSERT`
   - Verifies row counts match
3. Swap `db.js` backend from Turso/SQLite to `pg` (node-postgres)
4. Run the application against PG in staging first
5. Deploy

**Data export from Turso:**
```bash
# Turso CLI export
turso db export localtune-prod --output dump.sql
# Or use libsql to dump
sqlite3 localtune.db .dump > dump.sql
```

### 2E. Index Additions Beyond Current Schema

```sql
-- Performance indexes for PostgreSQL
CREATE INDEX idx_tracks_search ON tracks USING gin (
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(artist, '') || ' ' || coalesce(album, ''))
);
-- Or simpler (without FTS for now):
CREATE INDEX idx_tracks_file_path ON tracks (file_path);
CREATE INDEX idx_playlist_tracks_playlist_id ON playlist_tracks (playlist_id);
CREATE INDEX idx_playlist_tracks_track_id ON playlist_tracks (track_id);
CREATE INDEX idx_favorites_user_id ON favorites (user_id);
CREATE INDEX idx_favorites_track_id ON favorites (track_id);
```

---

## 3. STORAGE MIGRATION PLAN

### 3A. Bucket Setup

| Setting | Value |
|---------|-------|
| Bucket name | `localtune-media` |
| Visibility | **Private** (all objects) |
| File size limit | 100 MB |
| Allowed MIME types | `audio/mpeg`, `audio/flac`, `audio/wav`, `audio/mp4`, `audio/ogg`, `audio/aac`, `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| CORS | Allow origin from Vercel frontend + mobile apps, `credentials: true` |

### 3B. Key Structure (Preserve Existing)

B2 object keys are preserved exactly in Supabase Storage. No key renaming.

| Category | B2 Key Pattern | Supabase Storage Path | Count Estimate |
|----------|---------------|----------------------|----------------|
| Audio | `music/{artist}/{album}/{filename}.mp3` | Same | Hundreds–thousands |
| Cover art | `artworks/{trackId}.{ext}` | Same | One per track |
| Artist images | `artists/{name}/{ext}` | Same | One per artist |
| Avatars | `avatars/{userId}.{ext}` | Same | One per user |
| Playlist covers | `playlist_covers/{name}.{ext}` | Same | Per playlist |

### 3C. Data Migration for Storage Objects

```bash
# Use rclone or Supabase CLI to migrate B2 → Supabase Storage
# rclone config:
# [b2]
# type = b2
# account = YOUR_B2_ACCOUNT_ID
# key = YOUR_B2_APPLICATION_KEY
#
# [supabase]
# type = s3
# provider = Other
# access_key_id = YOUR_SUPABASE_ANON_KEY
# secret_access_key = YOUR_SUPABASE_SERVICE_ROLE_KEY
# endpoint = https://YOUR_PROJECT.supabase.co/storage/v1/s3
# region = auto

rclone copy b2:localtune-media/ supabase:localtune-media/ --progress
```

**Critical:** The `file_path` column in `tracks` currently stores B2 object keys (e.g., `music/Artist/Album/song.mp3`). After migration, these same strings become Supabase Storage paths. The `b2_key` column also stores these same keys. **No data transformation needed for key strings.**

### 3D. Upload Flow — New Architecture

**Current flow (B2):**
```
Client → POST /api/upload (multipart, full audio buffer in body) → Server parses metadata → Server uploads to B2 → Server writes DB record
```

**New flow (Supabase Storage signed upload):**
```
1. Client → POST /api/upload/request-url { filename, contentType, size }
      → Server creates Supabase Storage signed upload URL
      → Returns { uploadUrl, path, token }

2. Client → PUT uploadUrl (raw audio bytes, or TUS for >6MB)
      → Supabase Storage stores the object

3. Client → POST /api/upload/confirm { path, token, metadata }
      → Server verifies object exists + correct size via Supabase Storage API
      → Server parses metadata (from client-provided fields, since music-metadata must run client-side)
      → Server writes DB record
```

**Client-side metadata extraction:**
- Add `music-metadata` (browser bundle) to the uploader portal and mobile upload
- Use `parseBlob(file)` to extract title, artist, album, duration, embedded art
- Send extracted metadata + custom overrides in step 3 confirm

### 3E. Image Serving

**Current:** `serveStoredImage()` → B2 presigned URL or CDN URL → 302 redirect

**New:** Same pattern with Supabase Storage:
```javascript
// Replace serveStoredImage()
async function serveStoredImage(res, storedPath, fallbackLocalFile = null) {
  if (!storedPath || isLocalPath(storedPath)) { /* local fallback */ }

  const { data, error } = await supabaseAdmin.storage
    .from('localtune-media')
    .createSignedUrl(storedPath, 3600); // 1 hour expiry

  if (error || !data?.signedUrl) {
    return res.status(404).json({ error: 'Image not found' });
  }

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, data.signedUrl);
}
```

### 3F. Audio Streaming

**Current:** `GET /stream/:trackId` → B2 presigned URL → 302 redirect

**New:** Same pattern:
```javascript
// Replace getPresignedStreamUrl()
async function getPresignedStreamUrl(storageKey, expiresIn = 7200) {
  const { data, error } = await supabaseAdmin.storage
    .from('localtune-media')
    .createSignedUrl(storageKey, expiresIn);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}
```

**Signed URL TTL:** 7200 seconds (2 hours) — same as current B2 config.
**Range requests:** Supabase Storage supports HTTP Range on signed URLs, so `<audio>` element seeking works via 302 redirect.

---

## 4. AUTH MIGRATION PLAN

### 4A. Decision: Keep express-session (do NOT migrate to Supabase Auth)

**Rationale:**
- The entire app uses `req.session.userId` / `req.session.username` across all routes
- Both desktop (Vercel rewrites) and mobile clients use `credentials: 'include'` with session cookies
- Supabase Auth would require rewriting every route handler to use JWT verification
- Supabase Auth doesn't support the multi-user LAN-friendly username/password flow as naturally
- Session-based auth is working and the session store is in-memory (stateless server)

**Migration actions:**
1. Keep `express-session` with the same cookie configuration
2. Add `connect-pg-simple` to store sessions in PostgreSQL (currently in-memory, which resets on server restart)
3. Update `SESSION_SECRET` to a strong value in production env

```bash
npm install connect-pg-simple
```

```javascript
// In index.js, replace in-memory session store:
import pgSession from 'connect-pg-simple(session)';
import pg from 'pg';

const pgPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

app.use(session({
  store: new pgSession({
    pool: pgPool,
    tableName: 'user_sessions'  // auto-created
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));
```

### 4B. Session Table DDL (auto-created by connect-pg-simple)

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
  sid     TEXT NOT NULL COLLATE "default" PRIMARY KEY,
  sess    JSONB NOT NULL,
  expire  TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS user_sessions_expire_idx ON user_sessions (expire);
```

---

## 5. DEPENDENCY CHANGES

### 5A. Packages to REMOVE

| Package | Reason |
|---------|--------|
| `@tursodatabase/serverless` | Replaced by `pg` (node-postgres) |
| `better-sqlite3` | Replaced by `pg`; no local SQLite needed in production |
| `@aws-sdk/client-s3` | Replaced by `@supabase/supabase-js` |
| `@aws-sdk/s3-request-presigner` | Replaced by `supabase.storage.createSignedUrl()` |
| `multer` (disk storage) | Upload flow changes to signed URLs; keep `multer` for avatar/artist portal only |

### 5B. Packages to ADD

| Package | Version | Reason |
|---------|---------|--------|
| `pg` | `^8.x` | PostgreSQL client (`node-postgres`) |
| `@supabase/supabase-js` | `^2.x` | Supabase Storage API (signed URLs, list, delete) |
| `connect-pg-simple` | `^9.x` | PostgreSQL-backed express-session store |

### 5C. Packages UNCHANGED

| Package | Notes |
|---------|-------|
| `bcryptjs` | Password hashing, DB-agnostic |
| `cors` | CORS configuration, DB-agnostic |
| `dotenv` | Env loading, DB-agnostic |
| `express` | HTTP framework, DB-agnostic |
| `express-session` | Session management, backend-agnostic |
| `music-metadata` | Server-side parsing still needed for scanner; browser bundle needed for upload flow |
| `concurrently` | Dev tooling |

### 5D. Client-side Additions

| Package | Where | Reason |
|---------|-------|--------|
| `music-metadata` (browser bundle) | `client/`, `mobile-client/` | Client-side audio metadata extraction for signed upload flow |

### 5E. Final package.json (server)

```json
{
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "connect-pg-simple": "^9.0.1",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "express-session": "^1.18.1",
    "music-metadata": "^10.0.0",
    "multer": "^2.2.0",
    "@supabase/supabase-js": "^2.45.0",
    "pg": "^8.13.0"
  }
}
```

---

## 6. FILE-BY-FILE CHANGE LIST

### 6A. Files to CREATE

| File | Purpose |
|------|---------|
| `server/supabase.js` | Shared Supabase client (admin + anon), replaces `server/b2.js` |
| `server/db-pg.js` | PostgreSQL query helpers using `pg` pool (or rewrite `db.js`) |
| `scripts/migrate-sqlite-to-pg.js` | One-shot data migration script (SQLite dump → PG insert) |
| `scripts/verify-migration.js` | Row count + sample data verification |
| `supabase/config.toml` | Supabase project configuration |
| `supabase/migrations/001_initial.sql` | Supabase-managed migration (same DDL as Section 2B) |
| `supabase/storage.sql` | Bucket policies and RLS for storage |

### 6B. Files to DELETE

| File | Lines | Reason |
|------|-------|--------|
| `server/b2.js` | 561 | Entirely B2-specific (Native API auth, S3Client, presigned URLs, key builders) |
| `server/migrations/001_initial_schema.sql` through `007_*.sql` | ~120 | Consolidated into single PG DDL; migration manager no longer needed |
| `server/migrations/migrationManager.js` | 74 | Supabase migrations replace this |
| `server/schema.sql` | 71 | Replaced by `supabase/migrations/001_initial.sql` |
| `server/localtune.db` | — | SQLite database file, no longer needed |
| `server/scripts/init-turso.js` | — | Turso initialization script |

### 6C. Files to REWRITE (major changes)

| File | Current Lines | Changes |
|------|---------------|---------|
| **`server/db.js`** | 797 | **Complete rewrite.** Remove Turso/SQLite backends. Replace with `pg` Pool. Every query: `?` → `$1`, `LIKE` → `ILIKE`, `batch()` → transactions, `run()` → return `{changes: rowCount, lastInsertRowid}`, `LAST_INSERT_ROWID` → `RETURNING id`. |
| **`server/index.js`** | 193 | Add Supabase client init. Add `connect-pg-simple` session store. Remove Turso/SQLite init. Update env vars. |
| **`server/mediaServe.js`** | 51 | Replace B2 `resolveMediaUrl()` with Supabase Storage `createSignedUrl()`. Remove `isLocalPath`/`isB2Configured` checks. |
| **`server/uploader.js`** | 1448 | Remove multer (for main upload). Add signed-URL request endpoint + confirm endpoint. Keep multer for avatar/artist image uploads to Supabase Storage. Update `saveImageBuffer()` to use Supabase Storage. Update all B2 key builders to use Supabase Storage paths (same key format). |
| **`server/scanner.js`** | 492 | Replace `listB2Objects()` with `supabase.storage.from().list()`. Replace `getBufferFromB2()` with `supabase.storage.from().download()`. Replace `uploadToB2()` with `supabase.storage.from().upload()`. Remove all B2 imports. |
| **`server/routes/stream.js`** | 107 | Replace `getPresignedStreamUrl()` with Supabase Storage signed URL. Remove local fs fallback. |
| **`server/routes/auth.js`** | 186 | Avatar upload: replace B2 upload with Supabase Storage upload. Avatar serve: use Supabase Storage signed URL. |
| **`server/routes/tracks.js`** | 323 | Replace `serveStoredImage()` calls (now Supabase-backed). Replace `scanMissingMetadata()` call (scanner now uses Supabase Storage). |
| **`server/routes/playlists.js`** | 236 | Cover upload: replace multer disk storage with Supabase Storage upload. Cover serve: use Supabase Storage signed URL. |
| **`server/routes/scan.js`** | 28 | Scanner now uses Supabase Storage internally. Route unchanged. |
| **`server/routes/stats.js`** | 48 | Query translation only (`?` → `$1`). |
| **`server/routes/favorites.js`** | 39 | Query translation only (`?` → `$1`). |

### 6D. Files to MODIFY (minor changes)

| File | Changes |
|------|---------|
| **`server/package.json`** | Remove Turso/B2 deps, add pg/@supabase/supabase-js/connect-pg-simple |
| **`server/.env.example`** | Remove `TURSO_*`, `B2_*` vars. Add `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` |
| **`server/genreNormalizer.js`** | No changes (pure JS) |
| **`server/recommendationEngine.js`** | No changes (calls db.js functions, not raw SQL) |
| **`server/middleware/auth.js`** | No changes (session-based, DB-agnostic) |
| **`client/src/services/apiClient.js`** | Remove `ngrok-skip-browser-warning` header (dev-only) |
| **`client/vercel.json`** | Update rewrite destination from Render to new server host |
| **`mobile-client/src/config.js`** | Update `VITE_API_BASE_URL` for new server |

### 6E. Test Files

| File | Changes |
|------|---------|
| `server/tests/upload-pipeline.test.js` | **Rewrite.** Remove all B2 mocking. Mock Supabase Storage client instead. Test signed-URL flow + confirm flow. |
| `server/tests/tracks.test.js` | Replace `useTempDb()` with Supabase test DB or pg pool pointed at test DB |
| `server/tests/users.test.js` | Same |
| `server/tests/playlists.test.js` | Same |
| `server/tests/favorites.test.js` | Same |
| `server/tests/playlogs.test.js` | Same |
| `server/tests/recommendations.test.js` | Same |
| `server/tests/migrations.test.js` | Replace with Supabase migration verification |
| `server/tests/helpers.js` | Replace `useTempDb()` with PG test database setup |

---

## 7. TESTING PLAN

### 7A. Unit Tests to Preserve (with modifications)

| Test File | Test Count | Strategy |
|-----------|-----------|----------|
| `tracks.test.js` | ~10 tests | Replace `useTempDb()` → connect to PG test DB. All queries auto-translated. Verify CRUD, search, sort, dedup. |
| `users.test.js` | ~4 tests | Same PG approach. Verify register, login, avatar, public list. |
| `playlists.test.js` | ~5 tests | Same PG approach. Verify CRUD, track management, reorder. |
| `favorites.test.js` | ~3 tests | Same PG approach. Verify add, remove, list. |
| `playlogs.test.js` | ~4 tests | Same PG approach. Verify play event logging, transitions. |
| `recommendations.test.js` | ~8 tests | Same PG approach. Verify all recommendation algorithms. |
| `migrations.test.js` | ~2 tests | Replace with Supabase migration status verification. |

### 7B. Upload Pipeline Tests — Complete Rewrite

**Current:** `upload-pipeline.test.js` (843 lines) mocks B2 Native API with fake HTTPS handlers.
**New:** Mock `@supabase/supabase-js` client. Test:

1. `POST /api/upload/request-url` → returns valid signed URL
2. `PUT` to signed URL → stores object
3. `POST /api/upload/confirm` → creates DB record after verification
4. Metadata extraction from client-provided fields
5. Duplicate detection + adopt mode
6. Cover art and artist image upload via Supabase Storage
7. Error cases: oversized file, invalid type, storage failure, verification mismatch

### 7C. Integration Tests to ADD

| Test | Purpose |
|------|---------|
| PG connection pooling | Verify `pg` pool handles concurrent connections |
| Session persistence | Verify `connect-pg-simple` stores/retrieves sessions |
| Storage signed URLs | Verify Supabase Storage createSignedUrl + actual fetch |
| CORS | Verify cross-origin requests with credentials |
| Streaming redirect | Verify 302 → signed URL → audio bytes with Range |

### 7D. Manual Testing Checklist

- [ ] Register new user → session cookie set
- [ ] Login existing user → session cookie set
- [ ] Logout → session destroyed
- [ ] Upload audio via uploader portal → stored in Supabase, DB record created
- [ ] Upload artist profile image → stored in Supabase
- [ ] Stream audio → 302 to signed URL → audio plays with seeking
- [ ] View track artwork → 302 to signed URL → image loads
- [ ] View artist image → 302 to signed URL → image loads
- [ ] View user avatar → 302 to signed URL → image loads
- [ ] Create playlist → stored in PG
- [ ] Add/remove tracks from playlist → positions correct
- [ ] Reorder playlist → positions updated atomically
- [ ] Upload playlist cover → stored in Supabase
- [ ] Add/remove favorites → correct in PG
- [ ] Trigger library scan → reconciliation works with Supabase Storage
- [ ] Recommendations → all algorithms return results
- [ ] Metadata edit + reset → works
- [ ] Bulk edit → works
- [ ] Mobile client → all flows work with `VITE_API_BASE_URL`

---

## 8. RISK REGISTER

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| 1 | **Signed URL latency** — Supabase Storage signed URLs may add 50–200ms vs B2 CDN edge caching for artworks/images | Medium | High | Set appropriate Cache-Control headers on redirected responses. Consider Supabase CDN if available. |
| 2 | **Session loss on migration** — In-memory sessions drop on server restart during migration | Low | Certain | Acceptable — users re-login. With `connect-pg-simple`, sessions survive restarts post-migration. |
| 3 | **Data loss during migration** — SQLite → PG data copy may miss rows or corrupt data | High | Low | Run `scripts/verify-migration.js` to compare row counts + spot-check. Keep SQLite dump as backup. |
| 4 | **Storage migration timing** — B2 → Supabase Storage copy of large audio files may take hours | Medium | High | Run `rclone copy` in background. Verify with `rclone check` after. DB migration is fast (metadata only). |
| 5 | **`file_path` column semantics change** — Currently stores B2 keys like `music/Artist/Album/song.mp3`; these become Supabase Storage paths | Low | Certain | Paths are identical in format. No transformation needed. Verify `supabase.storage.from().download(path)` works with these paths. |
| 6 | **multer removal breaks uploader portal** — The HTML uploader sends multipart form data; signed-URL flow requires different client-side logic | Medium | Certain | Rewrite uploader portal JavaScript to use signed-URL flow. Keep multer for avatar/artist image endpoints that still use server-side upload. |
| 7 | **LIKE case sensitivity change** — SQLite `LIKE` is case-insensitive by default; PG `LIKE` is case-sensitive | High | High | Replace all `LIKE` with `ILIKE` in `getAllTracks()` search. Or use `LOWER()` wrapping. |
| 8 | **`batch()` semantics differ** — Turso `batch()` wraps in implicit transaction; PG requires explicit `BEGIN/COMMIT` | Medium | Medium | Replace `client.batch()` with a transaction helper function: `BEGIN; stmt1; stmt2; ...; COMMIT;` |
| 9 | **`LAST_INSERT_ROWID` replacement** — PG doesn't have this; use `RETURNING id` on INSERT | Medium | Certain | Modify all INSERT queries to append `RETURNING id`. Change `.run()` to read `rows[0].id`. |
| 10 | **Recommendation engine assumes all tracks in memory** — `getAllTracks({})` loads entire track list; PG can handle this but large libraries may be slow | Low | Low | Currently works with SQLite (similar performance). PG will be faster. No action needed. |
| 11 | **CORS `credentials: 'include'` with Supabase** — If API server moves, CORS origin must be updated | Medium | Certain | Update `cors({ origin: [...] })` with new allowed origins. Keep `credentials: true`. |
| 12 | **Supabase Storage 100MB limit** — Large FLAC files may exceed the default bucket limit | Medium | Medium | Increase bucket `file_size_limit` in Supabase dashboard to match B2 (no limit). Or set to 500MB. |
| 13 | **Edge Function cold starts** — If public routes move to Edge Functions, cold start latency (200–500ms) affects first request | Low | High | Keep public routes on the Express server to avoid this. Only move truly trivial endpoints. |
| 14 | **`music-metadata` browser bundle size** — Adding to client increases bundle by ~500KB | Low | Medium | Only add to uploader portal (lazy-loaded), not the main player bundle. Or use dynamic `import()`. |
| 15 | **PG connection pool exhaustion** — Concurrent requests may exhaust pool | Medium | Low | Set `pool.max: 20` in `pg.Pool` config. Monitor with `pg_pool_statistics`. |
| 16 | **Supabase rate limits** — Free tier has API rate limits | Medium | Medium | Upgrade to Pro tier for production. Or implement request queuing. |

---

## 9. ENVIRONMENT VARIABLES

### New `.env.example`

```bash
# --- Core ---
PORT=5000
SESSION_SECRET=change_me_to_a_long_random_string
NODE_ENV=production

# --- PostgreSQL (Supabase) ---
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# --- Supabase ---
SUPABASE_URL=https://[project-ref].supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # NEVER expose to browser
SUPABASE_ANON_KEY=eyJ...          # Safe for client-side

# --- Storage ---
STORAGE_BUCKET=localtune-media

# --- Legacy (remove after migration) ---
# TURSO_DATABASE_URL=
# TURSO_AUTH_TOKEN=
# B2_ACCOUNT_ID=
# B2_APPLICATION_KEY=
# B2_BUCKET_NAME=
# B2_ENDPOINT=
```

---

## 10. IMPLEMENTATION ORDER

| Phase | Duration | Work |
|-------|----------|------|
| **Phase 1: Foundation** | 2–3 days | Set up Supabase project, create PG schema, create storage bucket, set up `pg` client in `db.js`, verify all existing tests pass with PG backend |
| **Phase 2: Storage** | 2–3 days | Create `supabase.js`, replace `mediaServe.js`, replace `stream.js`, migrate B2 objects to Supabase Storage via `rclone`, verify image serving + audio streaming |
| **Phase 3: Auth & Sessions** | 1 day | Add `connect-pg-simple`, update session config, test auth flows |
| **Phase 4: Upload Pipeline** | 2–3 days | Rewrite upload flow to signed-URL pattern, update uploader portal HTML/JS, update avatar/artist image uploads |
| **Phase 5: Scanner** | 1–2 days | Rewrite scanner to use Supabase Storage API, test reconciliation |
| **Phase 6: Cleanup** | 1 day | Delete B2/Turso files, remove old migrations, update env vars, final verification |
| **Phase 7: Testing & Deploy** | 2–3 days | Rewrite all tests, integration testing, deploy to production |

**Total estimated effort: 11–15 days**
