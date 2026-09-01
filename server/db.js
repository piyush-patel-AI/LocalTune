/**
 * server/db.js
 *
 * PostgreSQL database client using node-postgres (pg).
 * Replaces the Turso/libSQL + better-sqlite3 dual backend.
 *
 * Preserves the same async API surface:
 *   .get()  -> row object | undefined
 *   .all()  -> array of row objects
 *   .run()  -> { changes: number, lastInsertRowid: number }
 *   .exec() -> void
 *   .batch() -> { changes: 0, lastInsertRowid: 0 }  (uses transactions)
 */

import pg from 'pg';
import { deleteFromStorage, isLocalPath } from './storage.js';

const { Pool } = pg;

let pool = null;

// Cap the shared pool safely under the Supabase/Render session-pool-mode
// connection ceiling (pool_size: 15). Override with PG_POOL_MAX if needed.
const MAX_POOL_CONNECTIONS = parseInt(process.env.PG_POOL_MAX, 10) || 10;

/**
 * Create the single PostgreSQL connection pool.
 * Called exactly once; the returned instance is cached by getPool().
 */
function createPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: MAX_POOL_CONNECTIONS,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
}

/**
 * Get the shared singleton pool, creating it exactly once per process.
 * Safe to call from anywhere (app queries, connect-pg-simple, scripts).
 */
export function getPool() {
  if (!pool) {
    pool = createPool();
  }
  return pool;
}

/**
 * Initialize the PostgreSQL connection pool and verify connectivity.
 * Idempotent; safe to call multiple times. Always performs the
 * connection test so the caller (index.js) can gate app.listen() on it.
 */
export async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const p = getPool();

  // Test the connection
  const client = await p.connect();
  try {
    await client.query('SELECT NOW()');
    console.log('[db.js] PostgreSQL connected successfully');
  } finally {
    client.release();
  }

  return p;
}

/**
 * Execute a query and return all rows.
 */
async function queryAll(sql, params = []) {
  const p = getPool();
  const result = await p.query(sql, params);
  return result.rows;
}

/**
 * Execute a query and return the first row.
 */
async function queryGet(sql, params = []) {
  const p = getPool();
  const result = await p.query(sql, params);
  return result.rows[0];
}

/**
 * Execute a write query (INSERT/UPDATE/DELETE).
 * Returns { changes: number, lastInsertRowid: number }.
 */
async function queryRun(sql, params = []) {
  const p = getPool();
  const result = await p.query(sql, params);
  return {
    changes: result.rowCount || 0,
    lastInsertRowid: result.rows[0]?.id ?? 0,
  };
}

/**
 * Execute raw SQL (for schema setup, migrations).
 */
async function queryExec(sql) {
  const p = getPool();
  await p.query(sql);
}

/**
 * Execute a batch of statements in a transaction.
 */
async function queryBatch(statements) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    for (const stmt of statements) {
      await client.query(stmt.sql, stmt.args || []);
    }
    await client.query('COMMIT');
    return { changes: 0, lastInsertRowid: 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// --- Raw escape hatch (scripts/tests only; app code uses the wrappers) ---
export const rawAll = queryAll;
export const rawGet = queryGet;
export const rawRun = queryRun;
export const rawExec = queryExec;
export const rawBatch = queryBatch;
export const getBackendMode = () => 'postgres';

// --- User Operations ---
export const createUser = async (username, passwordHash, displayName) => {
  const result = await queryRun(
    `INSERT INTO users (username, password_hash, display_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [username, passwordHash, displayName]
  );
  return result.lastInsertRowid;
};

export const getUserByUsername = async (username) => {
  return queryGet(`SELECT * FROM users WHERE username = $1`, [username]);
};

export const getUserById = async (id) => {
  return queryGet(
    `SELECT id, username, display_name, avatar_path, date_created FROM users WHERE id = $1`,
    [id]
  );
};

export const updateUserAvatar = async (id, avatarPath) => {
  await queryRun(`UPDATE users SET avatar_path = $1 WHERE id = $2`, [avatarPath, id]);
  return getUserById(id);
};

export const getAllUsersPublic = async () => {
  return queryAll(`SELECT id, username, display_name, avatar_path FROM users`);
};

// --- Track Operations ---
export const upsertTrack = async (track) => {
  const existing = await queryGet(
    `SELECT id, date_modified, cover_art_path, release_type, genre, year FROM tracks WHERE file_path = $1`,
    [track.filePath]
  );
  const coverArt = track.coverArtPath !== undefined ? track.coverArtPath : (existing ? existing.cover_art_path : null);
  const releaseType = track.releaseType || track.release_type || (existing ? existing.release_type : 'album') || 'album';
  const genreVal = track.genre !== undefined ? track.genre : (existing ? existing.genre : null);
  const yearVal = track.year !== undefined ? track.year : (existing ? existing.year : null);
  const b2Key = track.b2Key !== undefined ? track.b2Key : (existing && !isLocalPath(track.filePath) ? track.filePath : (existing?.b2_key ?? null));

  if (existing) {
    await queryRun(
      `UPDATE tracks 
       SET title = $1, artist = $2, album = $3, duration_seconds = $4, format = $5, file_size = $6, date_modified = $7, cover_art_path = $8, release_type = $9, genre = $10, year = $11, b2_key = $12
       WHERE file_path = $13`,
      [track.title, track.artist, track.album,
       track.durationSeconds || 0, track.format, track.fileSize || 0,
       track.dateModified, coverArt, releaseType, genreVal, yearVal, b2Key,
       track.filePath]
    );
    return existing.id;
  }

  const result = await queryRun(
    `INSERT INTO tracks (
      file_path, title, artist, album, duration_seconds, format, file_size, date_modified, cover_art_path, release_type, genre, year,
      original_title, original_artist, original_album, original_genre, original_year, b2_key
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    RETURNING id`,
    [track.filePath, track.title, track.artist, track.album,
     track.durationSeconds || 0, track.format, track.fileSize || 0,
     track.dateModified, coverArt, releaseType, genreVal, yearVal,
     track.title, track.artist, track.album, genreVal, yearVal, b2Key]
  );
  return result.lastInsertRowid;
};

export const updateTrackCoverArt = async (trackId, coverArtPath) => {
  return queryRun(`UPDATE tracks SET cover_art_path = $1 WHERE id = $2`, [coverArtPath, trackId]);
};

/** Set cover_art_path + artwork_b2_key together after uploading artwork. */
export const setTrackArtwork = async (trackId, coverArtPath, artworkB2Key) => {
  return queryRun(
    `UPDATE tracks SET cover_art_path = $1, artwork_b2_key = $2 WHERE id = $3`,
    [coverArtPath ?? null, artworkB2Key ?? null, trackId]
  );
};

/**
 * Migration helper: replace a legacy local-disk path with its storage key,
 * preserving the row id (and therefore playlist/favorite/history references).
 */
export const rekeyTrack = async (oldFilePath, newKey, fileSize = null, dateModified = null) => {
  return queryRun(
    `UPDATE tracks 
     SET file_path = $1, b2_key = $2, file_size = COALESCE($3, file_size), date_modified = COALESCE($4, date_modified)
     WHERE file_path = $5`,
    [newKey, newKey, fileSize, dateModified, oldFilePath]
  );
};

export const getTrackById = async (id) => {
  return queryGet(`SELECT * FROM tracks WHERE id = $1`, [id]);
};

export const getTrackByPath = async (filePath) => {
  return queryGet(`SELECT * FROM tracks WHERE file_path = $1`, [filePath]);
};

export const findTrackByTitleAndArtist = async (title, artist) => {
  if (!title || !artist) return null;
  return queryGet(
    `SELECT * FROM tracks 
     WHERE LOWER(TRIM(title)) = LOWER(TRIM($1)) 
       AND LOWER(TRIM(artist)) = LOWER(TRIM($2))`,
    [title, artist]
  );
};

export const removeDuplicateTracks = async () => {
  const duplicates = await queryAll(`
    SELECT id, file_path, b2_key, artwork_b2_key FROM tracks 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM tracks 
      GROUP BY LOWER(TRIM(title)), LOWER(TRIM(artist))
    )
  `);

  let removedCount = 0;
  for (const dup of duplicates) {
    await queryRun(`DELETE FROM tracks WHERE id = $1`, [dup.id]);
    removedCount++;

    // Remove the corresponding storage object
    const audioKey = dup.b2_key || (!isLocalPath(dup.file_path) ? dup.file_path : null);
    if (audioKey) {
      try {
        await deleteFromStorage(audioKey);
      } catch (err) {
        console.error(`[DB] Failed to delete audio storage object ${audioKey}:`, err.message);
      }
    }

    if (dup.artwork_b2_key) {
      try {
        await deleteFromStorage(dup.artwork_b2_key);
      } catch (err) {
        console.error(`[DB] Failed to delete artwork storage object ${dup.artwork_b2_key}:`, err.message);
      }
    }
  }
  return removedCount;
};

export const getAllTracks = async (options = {}) => {
  const { search, artist, releaseType, sortBy = 'title', sortOrder = 'ASC' } = options;
  let sql = `SELECT * FROM tracks`;
  const params = [];
  const conditions = [];
  let paramIndex = 1;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(`(title ILIKE $${paramIndex} OR artist ILIKE $${paramIndex + 1} OR album ILIKE $${paramIndex + 2})`);
    params.push(term, term, term);
    paramIndex += 3;
  }

  if (artist && artist.trim()) {
    const term = `%${artist.trim()}%`;
    conditions.push(`artist ILIKE $${paramIndex}`);
    params.push(term);
    paramIndex += 1;
  }

  if (releaseType && releaseType.trim()) {
    conditions.push(`LOWER(release_type) = LOWER($${paramIndex})`);
    params.push(releaseType.trim());
    paramIndex += 1;
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  const validSortColumns = ['title', 'artist', 'album', 'date_added', 'duration_seconds'];
  const sortCol = validSortColumns.includes(sortBy) ? sortBy : 'title';
  const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  sql += ` ORDER BY ${sortCol} ${order}`;

  return queryAll(sql, params);
};

export const deleteTrackByPath = async (filePath) => {
  return queryRun(`DELETE FROM tracks WHERE file_path = $1`, [filePath]);
};

export const getAlbums = async (releaseTypeFilter = null) => {
  let sql = `
    SELECT 
      album, 
      artist, 
      COUNT(*) as track_count,
      MAX(cover_art_path) as cover_art_path,
      COALESCE(MAX(release_type), 'album') as release_type,
      MAX(CASE WHEN cover_art_path IS NOT NULL THEN id ELSE id END) as sample_track_id
    FROM tracks 
  `;
  const params = [];
  if (releaseTypeFilter && releaseTypeFilter.trim() && releaseTypeFilter.toLowerCase() !== 'all') {
    sql += ` WHERE LOWER(release_type) = LOWER($1) `;
    params.push(releaseTypeFilter.trim());
  }
  sql += ` GROUP BY album, artist ORDER BY album ASC `;
  return queryAll(sql, params);
};

export const splitArtistNames = (artistStr) => {
  if (!artistStr || typeof artistStr !== 'string') return [];
  const parts = artistStr
    .split(/,\s*|\s+&\s+|\s+(?:feat|ft|featuring|vs)\.?\s+|\s+[xX]\s+/i)
    .map(name => name.trim())
    .filter(name => name.length > 0);

  const unique = [];
  const seen = new Set();
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      unique.push(p);
    }
  }
  return unique;
};

export const getArtists = async () => {
  const tracks = await queryAll(`SELECT id, artist, album FROM tracks WHERE artist IS NOT NULL AND TRIM(artist) != ''`);
  const artistImages = await queryAll(`SELECT artist_name, image_path FROM artist_images WHERE artist_name IS NOT NULL AND TRIM(artist_name) != ''`);

  const imageMap = new Map();
  for (const img of artistImages) {
    imageMap.set(img.artist_name.toLowerCase(), { name: img.artist_name, path: img.image_path });
  }

  const artistDataMap = new Map();

  function getOrCreateArtist(name) {
    const lower = name.toLowerCase();
    if (!artistDataMap.has(lower)) {
      const imgInfo = imageMap.get(lower);
      const displayName = imgInfo ? imgInfo.name : name;
      const imagePath = imgInfo ? imgInfo.path : null;
      artistDataMap.set(lower, {
        artist: displayName,
        tracks: new Set(),
        albums: new Set(),
        artist_image_path: imagePath
      });
    }
    return artistDataMap.get(lower);
  }

  for (const img of artistImages) {
    getOrCreateArtist(img.artist_name);
  }

  for (const t of tracks) {
    let artistsForTrack = [];
    const lowerArtist = t.artist.toLowerCase();
    if (imageMap.has(lowerArtist)) {
      artistsForTrack = [imageMap.get(lowerArtist).name];
    } else {
      artistsForTrack = splitArtistNames(t.artist);
    }

    for (const artName of artistsForTrack) {
      const artObj = getOrCreateArtist(artName);
      artObj.tracks.add(t.id);
      if (t.album) artObj.albums.add(t.album);
    }
  }

  return Array.from(artistDataMap.values()).map(a => ({
    artist: a.artist,
    track_count: a.tracks.size,
    album_count: a.albums.size,
    artist_image_path: a.artist_image_path
  })).sort((a, b) => a.artist.localeCompare(b.artist));
};

export const upsertArtistImage = async (artistName, imagePath, b2Key = null) => {
  if (!artistName || !imagePath) return;
  return queryRun(
    `INSERT INTO artist_images (artist_name, image_path, b2_key)
     VALUES ($1, $2, $3)
     ON CONFLICT(artist_name) DO UPDATE SET 
       image_path = EXCLUDED.image_path,
       b2_key = EXCLUDED.b2_key`,
    [artistName.trim(), imagePath, b2Key]
  );
};

export const getArtistImage = async (artistName) => {
  if (!artistName) return null;
  return queryGet(
    `SELECT image_path FROM artist_images WHERE LOWER(artist_name) = LOWER($1)`,
    [artistName.trim()]
  );
};

// --- Playlist Operations ---
export const createPlaylist = async (userId, name, coverPath = null) => {
  const result = await queryRun(
    `INSERT INTO playlists (user_id, name, cover_path) VALUES ($1, $2, $3)
     RETURNING id`,
    [userId, name, coverPath]
  );
  return result.lastInsertRowid;
};

export const updatePlaylistCover = async (playlistId, userId, coverPath) => {
  return queryRun(
    `UPDATE playlists SET cover_path = $1 WHERE id = $2 AND user_id = $3`,
    [coverPath, playlistId, userId]
  );
};

export const getUserPlaylists = async (userId) => {
  const playlists = await queryAll(`
    SELECT p.*, COUNT(pt.track_id) as track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    WHERE p.user_id = $1
    GROUP BY p.id
    ORDER BY p.date_created DESC
  `, [userId]);

  return Promise.all(playlists.map(async (pl) => ({
    ...pl,
    sample_tracks: await queryAll(`
      SELECT t.id, t.cover_art_path 
      FROM playlist_tracks pt
      JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = $1 AND t.cover_art_path IS NOT NULL AND TRIM(t.cover_art_path) != ''
      ORDER BY pt.position ASC
      LIMIT 4
    `, [pl.id])
  })));
};

export const getPlaylistById = async (playlistId, userId) => {
  const playlist = await queryGet(
    `SELECT * FROM playlists WHERE id = $1 AND user_id = $2`,
    [playlistId, userId]
  );
  if (!playlist) return null;

  const samples = await queryAll(`
    SELECT t.id, t.cover_art_path 
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = $1 AND t.cover_art_path IS NOT NULL AND TRIM(t.cover_art_path) != ''
    ORDER BY pt.position ASC
    LIMIT 4
  `, [playlistId]);

  return { ...playlist, sample_tracks: samples };
};

export const updatePlaylistName = async (playlistId, userId, newName) => {
  return queryRun(
    `UPDATE playlists SET name = $1 WHERE id = $2 AND user_id = $3`,
    [newName, playlistId, userId]
  );
};

export const deletePlaylist = async (playlistId, userId) => {
  return queryRun(
    `DELETE FROM playlists WHERE id = $1 AND user_id = $2`,
    [playlistId, userId]
  );
};

export const getPlaylistTracks = async (playlistId, userId) => {
  // Check ownership first
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return null;

  return queryAll(`
    SELECT t.*, pt.position 
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = $1
    ORDER BY pt.position ASC
  `, [playlistId]);
};

export const addTrackToPlaylist = async (playlistId, userId, trackId) => {
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  const maxPosRow = await queryGet(
    `SELECT COALESCE(MAX(position), -1) as max_pos FROM playlist_tracks WHERE playlist_id = $1`,
    [playlistId]
  );

  await queryRun(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position)
     VALUES ($1, $2, $3)
     ON CONFLICT(playlist_id, track_id) DO NOTHING`,
    [playlistId, trackId, (maxPosRow?.max_pos ?? -1) + 1]
  );

  return true;
};

export const removeTrackFromPlaylist = async (playlistId, userId, trackId) => {
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  await queryRun(
    `DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2`,
    [playlistId, trackId]
  );
  return true;
};

export const reorderPlaylistTracks = async (playlistId, userId, trackIds) => {
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  // Atomic batch: all position updates commit together or not at all
  await queryBatch(
    trackIds.map((trackId, index) => ({
      sql: `UPDATE playlist_tracks SET position = $1 WHERE playlist_id = $2 AND track_id = $3`,
      args: [index, playlistId, trackId]
    }))
  );

  return true;
};

// --- Favorite Operations ---
export const addFavorite = async (userId, trackId) => {
  return queryRun(
    `INSERT INTO favorites (user_id, track_id)
     VALUES ($1, $2)
     ON CONFLICT(user_id, track_id) DO NOTHING`,
    [userId, trackId]
  );
};

export const removeFavorite = async (userId, trackId) => {
  return queryRun(
    `DELETE FROM favorites WHERE user_id = $1 AND track_id = $2`,
    [userId, trackId]
  );
};

export const getUserFavorites = async (userId) => {
  return queryAll(`
    SELECT t.*, f.date_added as favorited_at
    FROM favorites f
    JOIN tracks t ON f.track_id = t.id
    WHERE f.user_id = $1
    ORDER BY f.date_added DESC
  `, [userId]);
};

export const isFavorite = async (userId, trackId) => {
  const row = await queryGet(
    `SELECT 1 FROM favorites WHERE user_id = $1 AND track_id = $2`,
    [userId, trackId]
  );
  return !!row;
};

// --- Recommendation Telemetry & Data Operations ---
export const logPlayEvent = async ({
  userId, trackId, listenedSeconds, durationSeconds, isReplay, previousTrackId,
  playOrigin = 'manual', sessionId = null
}) => {
  const listened = parseFloat(listenedSeconds) || 0;
  const duration = parseFloat(durationSeconds) || 0;
  const completionRatio = duration > 0 ? Math.min(1.0, listened / duration) : 0;
  const isSkip = (listened < 15 && duration >= 20 && completionRatio < 0.3) ? true : false;
  const hourOfDay = new Date().getHours();
  const origin = NORMALIZE_PLAY_ORIGIN(playOrigin);
  const sess = sessionId && typeof sessionId === 'string' ? sessionId.slice(0, 255) : null;

  await queryRun(
    `INSERT INTO play_logs (user_id, track_id, listened_seconds, duration_seconds, completion_ratio, is_skip, is_replay, hour_of_day, play_origin, session_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [userId, trackId, listened, duration, completionRatio, isSkip, !!isReplay, hourOfDay, origin, sess]
  );

  // Strong negative feedback telemetry: accumulates skip history on the track so
  // the anti-repetition pipeline can suppress it with a decaying penalty.
  if (isSkip) {
    await queryRun(
      `UPDATE tracks
       SET total_skip_count = COALESCE(total_skip_count, 0) + 1, last_skipped_at = NOW()
       WHERE id = $1`,
      [trackId]
    );
  }

  if (previousTrackId && previousTrackId !== trackId) {
    await queryRun(
      `INSERT INTO song_transitions (user_id, from_track_id, to_track_id, transition_count, last_transition_time)
       VALUES ($1, $2, $3, 1, NOW())
       ON CONFLICT(user_id, from_track_id, to_track_id) DO UPDATE SET
         transition_count = song_transitions.transition_count + 1,
         last_transition_time = NOW()`,
      [userId, previousTrackId, trackId]
    );
  }

  // Attribute the outcome to the most recent recommendation impression of this
  // track so we can later learn P(play/completion/skip | recommendation).
  await updateLatestRecommendationOutcome({
    userId, trackId, listenedSeconds: listened, durationSeconds: duration,
    completionRatio, isSkip, isReplay: !!isReplay
  });
};

const NORMALIZE_PLAY_ORIGIN = (origin) => {
  const value = String(origin || '').trim().toLowerCase();
  const allowed = new Set([
    'manual', 'search', 'library', 'playlist', 'favorite', 'radio',
    'recommended', 'autoplay', 'queue', 'shuffle'
  ]);
  return allowed.has(value) ? value : 'manual';
};

/**
 * Fold a completed play outcome back onto the latest matching recommendation
 * impression within a short lookback window. This is what turns
 * recommendation_logs rows into labeled training examples (played/completed/
 * skipped/replayed) without requiring the client to correlate them itself.
 */
export const updateLatestRecommendationOutcome = async ({
  userId, trackId, listenedSeconds, durationSeconds, completionRatio, isSkip, isReplay
}) => {
  if (!userId || !trackId) return;
  const result = await queryRun(
    `UPDATE recommendation_logs
     SET listened_seconds = $1,
         completion_ratio = $2,
         is_skip = $3,
         is_replay = $4
     WHERE id = (
       SELECT id FROM recommendation_logs
       WHERE user_id = $5 AND track_id = $6 AND action IN ('played', 'shown')
         AND timestamp > NOW() - INTERVAL '2 hours'
       ORDER BY timestamp DESC
       LIMIT 1
     )`,
    [listenedSeconds || 0, completionRatio || 0, !!isSkip, !!isReplay, userId, trackId]
  );
  return result.changes;
};

export const markRecommendationFavorited = async (userId, trackId, favorited) => {
  if (!userId || !trackId) return;
  await queryRun(
    `UPDATE recommendation_logs SET favorited = $1
     WHERE id = (
       SELECT id FROM recommendation_logs
       WHERE user_id = $2 AND track_id = $3 AND action IN ('played', 'shown')
         AND timestamp > NOW() - INTERVAL '24 hours'
       ORDER BY timestamp DESC
       LIMIT 1
     )`,
    [!!favorited, userId, trackId]
  );
};

export const getPlayLogsForUser = async (userId, options = {}) => {
  const limit = options.limit || 2000;
  return queryAll(`
    SELECT * FROM play_logs 
    WHERE user_id = $1 
    ORDER BY timestamp DESC 
    LIMIT $2
  `, [userId, limit]);
};

export const getTransitionsForUser = async (userId) => {
  return queryAll(`
    SELECT * FROM song_transitions 
    WHERE user_id = $1
  `, [userId]);
};

// --- Single & Bulk Metadata Management ---
export const updateTrackMetadata = async (trackId, metadata) => {
  const current = await queryGet(`SELECT * FROM tracks WHERE id = $1`, [trackId]);
  if (!current) return null;

  const title = metadata.title !== undefined ? metadata.title.trim() : current.title;
  const artist = metadata.artist !== undefined ? metadata.artist.trim() : current.artist;
  const album = metadata.album !== undefined ? metadata.album.trim() : current.album;
  const genre = metadata.genre !== undefined ? (metadata.genre ? metadata.genre.trim() : null) : current.genre;
  const year = metadata.year !== undefined ? (metadata.year ? parseInt(metadata.year, 10) : null) : current.year;
  const language = metadata.language !== undefined ? (metadata.language ? metadata.language.trim() : null) : current.language;
  const composer = metadata.composer !== undefined ? (metadata.composer ? metadata.composer.trim() : null) : current.composer;
  const comment = metadata.comment !== undefined ? (metadata.comment ? metadata.comment.trim() : null) : current.comment;
  const rating = metadata.rating !== undefined ? (metadata.rating ? parseInt(metadata.rating, 10) : null) : current.rating;
  const tags = metadata.tags !== undefined ? (metadata.tags ? metadata.tags.trim() : null) : current.tags;

  await queryRun(
    `UPDATE tracks 
     SET title = $1, artist = $2, album = $3, genre = $4, year = $5, language = $6, composer = $7, comment = $8, rating = $9, tags = $10, metadata_updated_at = NOW()
     WHERE id = $11`,
    [title, artist, album, genre, year, language, composer, comment, rating, tags, trackId]
  );

  return getTrackById(trackId);
};

export const resetTrackMetadata = async (trackId) => {
  const current = await queryGet(`SELECT * FROM tracks WHERE id = $1`, [trackId]);
  if (!current) return null;

  const title = current.original_title || current.title;
  const artist = current.original_artist || current.artist;
  const album = current.original_album || current.album;
  const genre = current.original_genre !== undefined ? current.original_genre : current.genre;
  const year = current.original_year !== undefined ? current.original_year : current.year;

  await queryRun(
    `UPDATE tracks
     SET title = $1, artist = $2, album = $3, genre = $4, year = $5, metadata_updated_at = NOW()
     WHERE id = $6`,
    [title, artist, album, genre, year, trackId]
  );

  return getTrackById(trackId);
};

export const bulkUpdateTrackMetadata = async (trackIds, updates) => {
  if (!Array.isArray(trackIds) || trackIds.length === 0) return 0;

  const setClauses = [];
  const params = [];
  let paramIndex = 1;

  if (updates.genre !== undefined) {
    setClauses.push(`genre = $${paramIndex}`);
    params.push(updates.genre ? updates.genre.trim() : null);
    paramIndex++;
  }
  if (updates.year !== undefined) {
    setClauses.push(`year = $${paramIndex}`);
    params.push(updates.year ? parseInt(updates.year, 10) : null);
    paramIndex++;
  }
  if (updates.artist !== undefined && updates.artist.trim()) {
    setClauses.push(`artist = $${paramIndex}`);
    params.push(updates.artist.trim());
    paramIndex++;
  }
  if (updates.album !== undefined && updates.album.trim()) {
    setClauses.push(`album = $${paramIndex}`);
    params.push(updates.album.trim());
    paramIndex++;
  }

  if (setClauses.length === 0) return 0;

  setClauses.push('metadata_updated_at = NOW()');

  const placeholders = trackIds.map((_, i) => `$${paramIndex + i}`).join(',');
  const sql = `UPDATE tracks SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`;

  params.push(...trackIds);
  const result = await queryRun(sql, params);
  return result.changes;
};

export const getMissingMetadataTracks = async () => {
  return queryAll(`
    SELECT * FROM tracks 
    WHERE genre IS NULL OR TRIM(genre) = '' OR year IS NULL
  `);
};

export const logRecommendationAction = async ({
  userId, trackId, shelfId, action, algorithmVersion = 'v2',
  source = null, surface = 'generic', sessionId = null,
  currentTrackId = null, positionInQueue = null
}) => {
  if (!userId || !trackId) return;
  const sess = sessionId && typeof sessionId === 'string' ? sessionId.slice(0, 255) : null;
  await queryRun(
    `INSERT INTO recommendation_logs (
       user_id, track_id, shelf_id, action, algorithm_version,
       source, recommendation_surface, session_id, current_track_id, position_in_queue
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [userId, trackId, shelfId || 'recommendations', action, algorithmVersion,
     source || null, surface, sess, currentTrackId || null,
     Number.isInteger(positionInQueue) ? positionInQueue : null]
  );
};

/** Diagnostic/learner helper: recent recommendation impressions with context. */
export const getRecommendationLogsForUser = async (userId, options = {}) => {
  const limit = options.limit || 4000;
  return queryAll(`
    SELECT * FROM recommendation_logs
    WHERE user_id = $1
    ORDER BY timestamp DESC
    LIMIT $2
  `, [userId, limit]);
};

export const updateRecommendationStats = async (trackId) => {
  if (!trackId) return;
  await queryRun(
    `UPDATE tracks 
     SET last_recommended_at = NOW(), recommendation_count = COALESCE(recommendation_count, 0) + 1
     WHERE id = $1`,
    [trackId]
  );
};

// --- Aggregates formerly done with raw prepares outside db.js ---

/** Library overview counts (routes/stats.js). */
export const getLibraryStats = async () => {
  const [tracks, artists, albums] = await Promise.all([
    queryGet(`SELECT COUNT(*) AS count FROM tracks`),
    queryGet(`SELECT COUNT(DISTINCT artist) AS count FROM tracks`),
    queryGet(`SELECT COUNT(DISTINCT album) AS count FROM tracks WHERE album IS NOT NULL AND TRIM(album) != ''`)
  ]);
  return {
    totalTracks: tracks?.count || 0,
    totalArtists: artists?.count || 0,
    totalAlbums: albums?.count || 0
  };
};

/** Scan info lookup for the library scanner (replaces raw prepares there). */
export const getTrackScanInfoByPath = async (filePath) => {
  return queryGet(
    `SELECT id, date_modified, file_size FROM tracks WHERE file_path = $1`,
    [filePath]
  );
};
