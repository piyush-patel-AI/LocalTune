import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runMigrations, splitStatements } from './migrations/migrationManager.js';
import { deleteFromB2, isLocalPath } from './b2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Async database client with two interchangeable backends:
 *
 *  - "turso": Turso Cloud via @tursodatabase/serverless (pure fetch, zero
 *    native dependencies). Selected automatically when TURSO_DATABASE_URL is set.
 *  - "local": better-sqlite3 wrapped in the same async surface. Used for
 *    development and tests (and until Turso credentials are provisioned).
 *
 * Every operation below preserves the historical better-sqlite3 return shapes:
 *   .get()  -> row object | undefined
 *   .all()  -> array of row objects
 *   .run()  -> { changes: number, lastInsertRowid: number }
 * Explicit null returns (getPlaylistById / getPlaylistTracks / etc.) are kept.
 */

let client = null;
let initPromise = null;

/**
 * Turso Cloud backend (@tursodatabase/serverless).
 *
 * Uses two independent connections to avoid a driver bug where `exec()`
 * (pipeline /v3/pipeline) can redirect the session's internal `baseUrl`
 * via the server's `base_url` response field.  That redirected URL may
 * not serve `/v3/cursor`, so all cursor-based reads (get/all/run/batch)
 * would 404.  Keeping a separate `execConn` isolates the redirect.
 */
async function createTursoClient(url, authToken) {
  const { connect } = await import('@tursodatabase/serverless');
  const readConn = connect({ url, authToken });
  const execConn = connect({ url, authToken });
  const normInfo = (info) => ({
    changes: Number(info?.changes ?? 0),
    lastInsertRowid: info?.lastInsertRowid == null ? 0 : Number(info.lastInsertRowid)
  });
  const hostname = new URL(url.replace(/^(libsql|turso):\/\//, 'https://')).hostname;
  console.log(`[db.js] Turso connected: ${hostname}`);
  return {
    mode: 'turso',
    all: async (sql, ...params) => await readConn.all(sql, ...params),
    get: async (sql, ...params) => await readConn.get(sql, ...params),
    run: async (sql, ...params) => normInfo(await readConn.run(sql, ...params)),
    exec: async (sql) => {
      for (const stmt of splitStatements(sql)) await execConn.exec(stmt);
    },
    batch: async (statements) => {
      await readConn.batch(
        statements.map((s) => ({ sql: s.sql, args: s.args || [] })),
        'write'
      );
      return { changes: 0, lastInsertRowid: 0 };
    }
  };
}

/** Local SQLite backend (better-sqlite3), identical semantics. */
async function createLocalClient(dbPath) {
  const { default: Database } = await import('better-sqlite3');
  const sqlite = new Database(dbPath);
  sqlite.pragma('foreign_keys = ON');
  return {
    mode: 'local',
    all: async (sql, ...params) => sqlite.prepare(sql).all(...params),
    get: async (sql, ...params) => sqlite.prepare(sql).get(...params),
    run: async (sql, ...params) => {
      const info = sqlite.prepare(sql).run(...params);
      return { changes: Number(info.changes), lastInsertRowid: Number(info.lastInsertRowid) };
    },
    exec: async (sql) => { sqlite.exec(sql); },
    batch: async (statements) => {
      const tx = sqlite.transaction(() => {
        for (const s of statements) sqlite.prepare(s.sql).run(...(s.args || []));
      });
      tx();
      return { changes: 0, lastInsertRowid: 0 };
    }
  };
}

/**
 * Initialize the database connection, schema and versioned migrations.
 * Idempotent; safe to await multiple times. Also invoked lazily by every
 * query helper, so importing modules never needs explicit bootstrapping.
 */
export async function initDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      const url = process.env.TURSO_DATABASE_URL;
      client = url
        ? await createTursoClient(url, process.env.TURSO_AUTH_TOKEN)
        : await createLocalClient(process.env.DB_PATH || path.join(__dirname, 'localtune.db'));

      console.log(`[db.js] Database backend: ${client.mode === 'turso' ? 'Turso Cloud' : 'local SQLite'} (${client.mode})`);

      try {
        await client.exec('PRAGMA foreign_keys = ON');
      } catch (e) {
        console.warn('[db.js] PRAGMA foreign_keys unsupported on this backend:', e.message);
      }

      const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
      await client.exec(schemaSql);

      try {
        await runMigrations(client);
      } catch (migErr) {
        console.error('[db.js] Error running migrations:', migErr.message);
      }

      try {
        const cleaned = await removeDuplicateTracks();
        if (cleaned > 0) {
          console.log(`[Database] Automatically cleaned up ${cleaned} duplicate track(s).`);
        }
      } catch (e) {
        console.error('Duplicate cleanup error on startup:', e);
      }

      return client;
    })();
  }
  return initPromise;
}

/** Resolve the active client, lazily initializing on first use. */
async function q() {
  if (!client) {
    if (!initPromise) initDatabase();
    await initPromise;
  }
  return client;
}

// --- Raw escape hatch (scripts/tests only; app code uses the wrappers) ---
export const rawAll = async (sql, ...params) => (await q()).all(sql, ...params);
export const rawGet = async (sql, ...params) => (await q()).get(sql, ...params);
export const rawRun = async (sql, ...params) => (await q()).run(sql, ...params);
export const rawExec = async (sql) => { await (await q()).exec(sql); };
export const rawBatch = async (statements) => (await q()).batch(statements);
export const getBackendMode = () => (client ? client.mode : null);

// --- User Operations ---
export const createUser = async (username, passwordHash, displayName) => {
  const info = await (await q()).run(
    `INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)`,
    username, passwordHash, displayName
  );
  return info.lastInsertRowid;
};

export const getUserByUsername = async (username) => {
  return (await q()).get(`SELECT * FROM users WHERE username = ?`, username);
};

export const getUserById = async (id) => {
  return (await q()).get(
    `SELECT id, username, display_name, avatar_path, date_created FROM users WHERE id = ?`,
    id
  );
};

export const updateUserAvatar = async (id, avatarPath) => {
  await (await q()).run(`UPDATE users SET avatar_path = ? WHERE id = ?`, avatarPath, id);
  return getUserById(id);
};

export const getAllUsersPublic = async () => {
  return (await q()).all(`SELECT id, username, display_name, avatar_path FROM users`);
};

// --- Track Operations ---
export const upsertTrack = async (track) => {
  const c = await q();
  const existing = await c.get(
    `SELECT id, date_modified, cover_art_path, release_type, genre, year FROM tracks WHERE file_path = ?`,
    track.filePath
  );
  const coverArt = track.coverArtPath !== undefined ? track.coverArtPath : (existing ? existing.cover_art_path : null);
  const releaseType = track.releaseType || track.release_type || (existing ? existing.release_type : 'album') || 'album';
  const genreVal = track.genre !== undefined ? track.genre : (existing ? existing.genre : null);
  const yearVal = track.year !== undefined ? track.year : (existing ? existing.year : null);
  const b2Key = track.b2Key !== undefined ? track.b2Key : (existing && !isLocalPath(track.filePath) ? track.filePath : (existing?.b2_key ?? null));

  if (existing) {
    await c.run(
      `UPDATE tracks 
       SET title = ?, artist = ?, album = ?, duration_seconds = ?, format = ?, file_size = ?, date_modified = ?, cover_art_path = ?, release_type = ?, genre = ?, year = ?, b2_key = ?
       WHERE file_path = ?`,
      track.title, track.artist, track.album,
      track.durationSeconds || 0, track.format, track.fileSize || 0,
      track.dateModified, coverArt, releaseType, genreVal, yearVal, b2Key,
      track.filePath
    );
    return existing.id;
  }

  const info = await c.run(
    `INSERT INTO tracks (
      file_path, title, artist, album, duration_seconds, format, file_size, date_modified, cover_art_path, release_type, genre, year,
      original_title, original_artist, original_album, original_genre, original_year, b2_key
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    track.filePath, track.title, track.artist, track.album,
    track.durationSeconds || 0, track.format, track.fileSize || 0,
    track.dateModified, coverArt, releaseType, genreVal, yearVal,
    track.title, track.artist, track.album, genreVal, yearVal, b2Key
  );
  return info.lastInsertRowid;
};

export const updateTrackCoverArt = async (trackId, coverArtPath) => {
  return (await q()).run(`UPDATE tracks SET cover_art_path = ? WHERE id = ?`, coverArtPath, trackId);
};

/** Set cover_art_path + artwork_b2_key together after uploading artwork to B2. */
export const setTrackArtwork = async (trackId, coverArtPath, artworkB2Key) => {
  return (await q()).run(
    `UPDATE tracks SET cover_art_path = ?, artwork_b2_key = ? WHERE id = ?`,
    coverArtPath ?? null, artworkB2Key ?? null, trackId
  );
};

/**
 * Migration helper: replace a legacy local-disk path with its B2 object key,
 * preserving the row id (and therefore playlist/favorite/history references).
 */
export const rekeyTrack = async (oldFilePath, newKey, fileSize = null, dateModified = null) => {
  return (await q()).run(
    `UPDATE tracks 
     SET file_path = ?, b2_key = ?, file_size = COALESCE(?, file_size), date_modified = COALESCE(?, date_modified)
     WHERE file_path = ?`,
    newKey, newKey, fileSize, dateModified, oldFilePath
  );
};

export const getTrackById = async (id) => {
  return (await q()).get(`SELECT * FROM tracks WHERE id = ?`, id);
};

export const getTrackByPath = async (filePath) => {
  return (await q()).get(`SELECT * FROM tracks WHERE file_path = ?`, filePath);
};

export const findTrackByTitleAndArtist = async (title, artist) => {
  if (!title || !artist) return null;
  return (await q()).get(
    `SELECT * FROM tracks 
     WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) 
       AND LOWER(TRIM(artist)) = LOWER(TRIM(?))`,
    title, artist
  );
};

export const removeDuplicateTracks = async () => {
  const c = await q();
  const duplicates = await c.all(`
    SELECT id, file_path, b2_key, artwork_b2_key FROM tracks 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM tracks 
      GROUP BY LOWER(TRIM(title)), LOWER(TRIM(artist))
    )
  `);

  let removedCount = 0;
  for (const dup of duplicates) {
    await c.run(`DELETE FROM tracks WHERE id = ?`, dup.id);
    removedCount++;

    // Remove the corresponding media object — B2 key or legacy local file
    const audioKey = dup.b2_key || (!isLocalPath(dup.file_path) ? dup.file_path : null);
    if (audioKey) {
      await deleteFromB2(audioKey);
    } else if (dup.file_path && isLocalPath(dup.file_path)) {
      try {
        if (fs.existsSync(dup.file_path)) fs.unlinkSync(dup.file_path);
      } catch (e) {
        console.error('Failed to remove duplicate file from disk:', dup.file_path, e.message);
      }
    }

    if (dup.artwork_b2_key) {
      await deleteFromB2(dup.artwork_b2_key);
    }
  }
  return removedCount;
};

export const getAllTracks = async (options = {}) => {
  const { search, artist, releaseType, sortBy = 'title', sortOrder = 'ASC' } = options;
  let sql = `SELECT * FROM tracks`;
  const params = [];
  const conditions = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(`(title LIKE ? OR artist LIKE ? OR album LIKE ?)`);
    params.push(term, term, term);
  }

  if (artist && artist.trim()) {
    const term = `%${artist.trim()}%`;
    conditions.push(`artist LIKE ?`);
    params.push(term);
  }

  if (releaseType && releaseType.trim()) {
    conditions.push(`LOWER(release_type) = LOWER(?)`);
    params.push(releaseType.trim());
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  const validSortColumns = ['title', 'artist', 'album', 'date_added', 'duration_seconds'];
  const sortCol = validSortColumns.includes(sortBy) ? sortBy : 'title';
  const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  sql += ` ORDER BY ${sortCol} ${order}`;

  return (await q()).all(sql, ...params);
};

export const deleteTrackByPath = async (filePath) => {
  return (await q()).run(`DELETE FROM tracks WHERE file_path = ?`, filePath);
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
    sql += ` WHERE LOWER(release_type) = LOWER(?) `;
    params.push(releaseTypeFilter.trim());
  }
  sql += ` GROUP BY album, artist ORDER BY album ASC `;
  return (await q()).all(sql, ...params);
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
  const c = await q();
  const tracks = await c.all(`SELECT id, artist, album FROM tracks WHERE artist IS NOT NULL AND TRIM(artist) != ''`);
  const artistImages = await c.all(`SELECT artist_name, image_path FROM artist_images WHERE artist_name IS NOT NULL AND TRIM(artist_name) != ''`);

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
  return (await q()).run(
    `INSERT INTO artist_images (artist_name, image_path, b2_key)
     VALUES (?, ?, ?)
     ON CONFLICT(artist_name) DO UPDATE SET 
       image_path = excluded.image_path,
       b2_key = excluded.b2_key`,
    artistName.trim(), imagePath, b2Key
  );
};

export const getArtistImage = async (artistName) => {
  if (!artistName) return null;
  return (await q()).get(
    `SELECT image_path FROM artist_images WHERE LOWER(artist_name) = LOWER(?)`,
    artistName.trim()
  );
};

// --- Playlist Operations ---
export const createPlaylist = async (userId, name, coverPath = null) => {
  const info = await (await q()).run(
    `INSERT INTO playlists (user_id, name, cover_path) VALUES (?, ?, ?)`,
    userId, name, coverPath
  );
  return info.lastInsertRowid;
};

export const updatePlaylistCover = async (playlistId, userId, coverPath) => {
  return (await q()).run(
    `UPDATE playlists SET cover_path = ? WHERE id = ? AND user_id = ?`,
    coverPath, playlistId, userId
  );
};

export const getUserPlaylists = async (userId) => {
  const c = await q();
  const playlists = await c.all(`
    SELECT p.*, COUNT(pt.track_id) as track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.date_created DESC
  `, userId);

  return Promise.all(playlists.map(async (pl) => ({
    ...pl,
    sample_tracks: await c.all(`
      SELECT t.id, t.cover_art_path 
      FROM playlist_tracks pt
      JOIN tracks t ON pt.track_id = t.id
      WHERE pt.playlist_id = ? AND t.cover_art_path IS NOT NULL AND TRIM(t.cover_art_path) != ''
      ORDER BY pt.position ASC
      LIMIT 4
    `, pl.id)
  })));
};

export const getPlaylistById = async (playlistId, userId) => {
  const c = await q();
  const playlist = await c.get(
    `SELECT * FROM playlists WHERE id = ? AND user_id = ?`,
    playlistId, userId
  );
  if (!playlist) return null;

  const samples = await c.all(`
    SELECT t.id, t.cover_art_path 
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = ? AND t.cover_art_path IS NOT NULL AND TRIM(t.cover_art_path) != ''
    ORDER BY pt.position ASC
    LIMIT 4
  `, playlistId);

  return { ...playlist, sample_tracks: samples };
};

export const updatePlaylistName = async (playlistId, userId, newName) => {
  return (await q()).run(
    `UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?`,
    newName, playlistId, userId
  );
};

export const deletePlaylist = async (playlistId, userId) => {
  return (await q()).run(
    `DELETE FROM playlists WHERE id = ? AND user_id = ?`,
    playlistId, userId
  );
};

export const getPlaylistTracks = async (playlistId, userId) => {
  // Check ownership first
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return null;

  return (await q()).all(`
    SELECT t.*, pt.position 
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `, playlistId);
};

export const addTrackToPlaylist = async (playlistId, userId, trackId) => {
  const c = await q();
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  const maxPosRow = await c.get(
    `SELECT COALESCE(MAX(position), -1) as max_pos FROM playlist_tracks WHERE playlist_id = ?`,
    playlistId
  );

  await c.run(
    `INSERT INTO playlist_tracks (playlist_id, track_id, position)
     VALUES (?, ?, ?)
     ON CONFLICT(playlist_id, track_id) DO NOTHING`,
    playlistId, trackId, maxPosRow.max_pos + 1
  );

  return true;
};

export const removeTrackFromPlaylist = async (playlistId, userId, trackId) => {
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  await (await q()).run(
    `DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?`,
    playlistId, trackId
  );
  return true;
};

export const reorderPlaylistTracks = async (playlistId, userId, trackIds) => {
  const playlist = await getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  // Atomic batch: all position updates commit together or not at all
  await (await q()).batch(
    trackIds.map((trackId, index) => ({
      sql: `UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?`,
      args: [index, playlistId, trackId]
    }))
  );

  return true;
};

// --- Favorite Operations ---
export const addFavorite = async (userId, trackId) => {
  return (await q()).run(
    `INSERT INTO favorites (user_id, track_id)
     VALUES (?, ?)
     ON CONFLICT(user_id, track_id) DO NOTHING`,
    userId, trackId
  );
};

export const removeFavorite = async (userId, trackId) => {
  return (await q()).run(
    `DELETE FROM favorites WHERE user_id = ? AND track_id = ?`,
    userId, trackId
  );
};

export const getUserFavorites = async (userId) => {
  return (await q()).all(`
    SELECT t.*, f.date_added as favorited_at
    FROM favorites f
    JOIN tracks t ON f.track_id = t.id
    WHERE f.user_id = ?
    ORDER BY f.date_added DESC
  `, userId);
};

export const isFavorite = async (userId, trackId) => {
  const row = await (await q()).get(
    `SELECT 1 FROM favorites WHERE user_id = ? AND track_id = ?`,
    userId, trackId
  );
  return !!row;
};

// --- Recommendation Telemetry & Data Operations ---
export const logPlayEvent = async ({ userId, trackId, listenedSeconds, durationSeconds, isReplay, previousTrackId }) => {
  const c = await q();
  const listened = parseFloat(listenedSeconds) || 0;
  const duration = parseFloat(durationSeconds) || 0;
  const completionRatio = duration > 0 ? Math.min(1.0, listened / duration) : 0;
  const isSkip = (listened < 15 && duration >= 20 && completionRatio < 0.3) ? 1 : 0;
  const hourOfDay = new Date().getHours();

  await c.run(
    `INSERT INTO play_logs (user_id, track_id, listened_seconds, duration_seconds, completion_ratio, is_skip, is_replay, hour_of_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, trackId, listened, duration, completionRatio, isSkip, isReplay ? 1 : 0, hourOfDay
  );

  if (previousTrackId && previousTrackId !== trackId) {
    await c.run(
      `INSERT INTO song_transitions (user_id, from_track_id, to_track_id, transition_count, last_transition_time)
       VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, from_track_id, to_track_id) DO UPDATE SET
         transition_count = transition_count + 1,
         last_transition_time = CURRENT_TIMESTAMP`,
      userId, previousTrackId, trackId
    );
  }
};

export const getPlayLogsForUser = async (userId) => {
  return (await q()).all(`
    SELECT * FROM play_logs 
    WHERE user_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 2000
  `, userId);
};

export const getTransitionsForUser = async (userId) => {
  return (await q()).all(`
    SELECT * FROM song_transitions 
    WHERE user_id = ?
  `, userId);
};

// --- Single & Bulk Metadata Management ---
export const updateTrackMetadata = async (trackId, metadata) => {
  const c = await q();
  const current = await c.get(`SELECT * FROM tracks WHERE id = ?`, trackId);
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

  await c.run(
    `UPDATE tracks 
     SET title = ?, artist = ?, album = ?, genre = ?, year = ?, language = ?, composer = ?, comment = ?, rating = ?, tags = ?, metadata_updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    title, artist, album, genre, year, language, composer, comment, rating, tags, trackId
  );

  return getTrackById(trackId);
};

export const resetTrackMetadata = async (trackId) => {
  const c = await q();
  const current = await c.get(`SELECT * FROM tracks WHERE id = ?`, trackId);
  if (!current) return null;

  const title = current.original_title || current.title;
  const artist = current.original_artist || current.artist;
  const album = current.original_album || current.album;
  const genre = current.original_genre !== undefined ? current.original_genre : current.genre;
  const year = current.original_year !== undefined ? current.original_year : current.year;

  await c.run(
    `UPDATE tracks
     SET title = ?, artist = ?, album = ?, genre = ?, year = ?, metadata_updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    title, artist, album, genre, year, trackId
  );

  return getTrackById(trackId);
};

export const bulkUpdateTrackMetadata = async (trackIds, updates) => {
  const c = await q();
  if (!Array.isArray(trackIds) || trackIds.length === 0) return 0;

  const setClauses = [];
  const params = [];

  if (updates.genre !== undefined) {
    setClauses.push('genre = ?');
    params.push(updates.genre ? updates.genre.trim() : null);
  }
  if (updates.year !== undefined) {
    setClauses.push('year = ?');
    params.push(updates.year ? parseInt(updates.year, 10) : null);
  }
  if (updates.artist !== undefined && updates.artist.trim()) {
    setClauses.push('artist = ?');
    params.push(updates.artist.trim());
  }
  if (updates.album !== undefined && updates.album.trim()) {
    setClauses.push('album = ?');
    params.push(updates.album.trim());
  }

  if (setClauses.length === 0) return 0;

  setClauses.push('metadata_updated_at = CURRENT_TIMESTAMP');

  const placeholders = trackIds.map(() => '?').join(',');
  const sql = `UPDATE tracks SET ${setClauses.join(', ')} WHERE id IN (${placeholders})`;

  const info = await c.run(sql, ...params, ...trackIds);
  return info.changes;
};

export const getMissingMetadataTracks = async () => {
  return (await q()).all(`
    SELECT * FROM tracks 
    WHERE genre IS NULL OR TRIM(genre) = '' OR year IS NULL
  `);
};

export const logRecommendationAction = async ({ userId, trackId, shelfId, action, algorithmVersion = 'v1' }) => {
  if (!userId || !trackId) return;
  await (await q()).run(
    `INSERT INTO recommendation_logs (user_id, track_id, shelf_id, action, algorithm_version)
     VALUES (?, ?, ?, ?, ?)`,
    userId, trackId, shelfId || 'recommendations', action, algorithmVersion
  );
};

export const updateRecommendationStats = async (trackId) => {
  if (!trackId) return;
  await (await q()).run(
    `UPDATE tracks 
     SET last_recommended_at = CURRENT_TIMESTAMP, recommendation_count = COALESCE(recommendation_count, 0) + 1
     WHERE id = ?`,
    trackId
  );
};

// --- Aggregates formerly done with raw prepares outside db.js ---

/** Library overview counts (routes/stats.js). */
export const getLibraryStats = async () => {
  const c = await q();
  const [tracks, artists, albums] = await Promise.all([
    c.get(`SELECT COUNT(*) AS count FROM tracks`),
    c.get(`SELECT COUNT(DISTINCT artist) AS count FROM tracks`),
    c.get(`SELECT COUNT(DISTINCT album) AS count FROM tracks WHERE album IS NOT NULL AND TRIM(album) != ''`)
  ]);
  return {
    totalTracks: tracks?.count || 0,
    totalArtists: artists?.count || 0,
    totalAlbums: albums?.count || 0
  };
};

/** Scan info lookup for the library scanner (replaces raw prepares there). */
export const getTrackScanInfoByPath = async (filePath) => {
  return (await q()).get(
    `SELECT id, date_modified, file_size FROM tracks WHERE file_path = ?`,
    filePath
  );
};
