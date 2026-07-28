import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, 'localtune.db');
const db = new Database(dbPath);

// Enable foreign key constraints
db.pragma('foreign_keys = ON');

// Initialize schema
const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schemaSql);

// Migration: Ensure cover_art_path column exists
try {
  db.exec(`ALTER TABLE tracks ADD COLUMN cover_art_path TEXT;`);
} catch (e) {
  // Column already exists
}

// Migration: Ensure release_type column exists
try {
  db.exec(`ALTER TABLE tracks ADD COLUMN release_type TEXT DEFAULT 'album';`);
} catch (e) {
  // Column already exists
}

// Export db instance & prepared statement wrappers
export default db;

// --- User Operations ---
export const createUser = (username, passwordHash, displayName) => {
  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, display_name)
    VALUES (?, ?, ?)
  `);
  const info = stmt.run(username, passwordHash, displayName);
  return info.lastInsertRowid;
};

export const getUserByUsername = (username) => {
  const stmt = db.prepare(`SELECT * FROM users WHERE username = ?`);
  return stmt.get(username);
};

export const getUserById = (id) => {
  const stmt = db.prepare(`SELECT id, username, display_name, date_created FROM users WHERE id = ?`);
  return stmt.get(id);
};

// --- Track Operations ---
export const upsertTrack = (track) => {
  const existing = db.prepare(`SELECT id, date_modified, cover_art_path, release_type FROM tracks WHERE file_path = ?`).get(track.filePath);
  const coverArt = track.coverArtPath !== undefined ? track.coverArtPath : (existing ? existing.cover_art_path : null);
  const releaseType = track.releaseType || track.release_type || (existing ? existing.release_type : 'album') || 'album';

  if (existing) {
    const stmt = db.prepare(`
      UPDATE tracks 
      SET title = ?, artist = ?, album = ?, duration_seconds = ?, format = ?, file_size = ?, date_modified = ?, cover_art_path = ?, release_type = ?
      WHERE file_path = ?
    `);
    stmt.run(
      track.title,
      track.artist,
      track.album,
      track.durationSeconds || 0,
      track.format,
      track.fileSize || 0,
      track.dateModified,
      coverArt,
      releaseType,
      track.filePath
    );
    return existing.id;
  } else {
    const stmt = db.prepare(`
      INSERT INTO tracks (file_path, title, artist, album, duration_seconds, format, file_size, date_modified, cover_art_path, release_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      track.filePath,
      track.title,
      track.artist,
      track.album,
      track.durationSeconds || 0,
      track.format,
      track.fileSize || 0,
      track.dateModified,
      coverArt,
      releaseType
    );
    return info.lastInsertRowid;
  }
};

export const updateTrackCoverArt = (trackId, coverArtPath) => {
  return db.prepare(`UPDATE tracks SET cover_art_path = ? WHERE id = ?`).run(coverArtPath, trackId);
};

export const getTrackById = (id) => {
  return db.prepare(`SELECT * FROM tracks WHERE id = ?`).get(id);
};

export const getTrackByPath = (filePath) => {
  return db.prepare(`SELECT * FROM tracks WHERE file_path = ?`).get(filePath);
};

export const findTrackByTitleAndArtist = (title, artist) => {
  if (!title || !artist) return null;
  const stmt = db.prepare(`
    SELECT * FROM tracks 
    WHERE LOWER(TRIM(title)) = LOWER(TRIM(?)) 
      AND LOWER(TRIM(artist)) = LOWER(TRIM(?))
  `);
  return stmt.get(title, artist);
};

export const removeDuplicateTracks = () => {
  const duplicates = db.prepare(`
    SELECT id, file_path FROM tracks 
    WHERE id NOT IN (
      SELECT MIN(id) 
      FROM tracks 
      GROUP BY LOWER(TRIM(title)), LOWER(TRIM(artist))
    )
  `).all();

  const deleteStmt = db.prepare(`DELETE FROM tracks WHERE id = ?`);
  let removedCount = 0;
  for (const dup of duplicates) {
    deleteStmt.run(dup.id);
    try {
      if (dup.file_path && fs.existsSync(dup.file_path)) {
        fs.unlinkSync(dup.file_path);
      }
    } catch (e) {
      console.error('Failed to remove duplicate file from disk:', dup.file_path, e);
    }
    removedCount++;
  }
  return removedCount;
};

// Run duplicate cleanup automatically on initialization
try {
  const cleaned = removeDuplicateTracks();
  if (cleaned > 0) {
    console.log(`[Database] Automatically cleaned up ${cleaned} duplicate track(s).`);
  }
} catch (e) {
  console.error('Duplicate cleanup error on startup:', e);
}

export const getAllTracks = (options = {}) => {
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

  return db.prepare(sql).all(...params);
};

export const deleteTrackByPath = (filePath) => {
  return db.prepare(`DELETE FROM tracks WHERE file_path = ?`).run(filePath);
};

export const getAlbums = (releaseTypeFilter = null) => {
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
  return db.prepare(sql).all(...params);
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

export const getArtists = () => {
  const tracks = db.prepare(`SELECT id, artist, album FROM tracks WHERE artist IS NOT NULL AND TRIM(artist) != ''`).all();
  const artistImages = db.prepare(`SELECT artist_name, image_path FROM artist_images WHERE artist_name IS NOT NULL AND TRIM(artist_name) != ''`).all();

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

export const upsertArtistImage = (artistName, imagePath) => {
  if (!artistName || !imagePath) return;
  const stmt = db.prepare(`
    INSERT INTO artist_images (artist_name, image_path)
    VALUES (?, ?)
    ON CONFLICT(artist_name) DO UPDATE SET image_path = excluded.image_path
  `);
  return stmt.run(artistName.trim(), imagePath);
};

export const getArtistImage = (artistName) => {
  if (!artistName) return null;
  const stmt = db.prepare(`SELECT image_path FROM artist_images WHERE LOWER(artist_name) = LOWER(?)`);
  return stmt.get(artistName.trim());
};

// --- Playlist Operations ---
export const createPlaylist = (userId, name) => {
  const stmt = db.prepare(`INSERT INTO playlists (user_id, name) VALUES (?, ?)`);
  const info = stmt.run(userId, name);
  return info.lastInsertRowid;
};

export const getUserPlaylists = (userId) => {
  return db.prepare(`
    SELECT p.*, COUNT(pt.track_id) as track_count
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.date_created DESC
  `).all(userId);
};

export const getPlaylistById = (playlistId, userId) => {
  return db.prepare(`SELECT * FROM playlists WHERE id = ? AND user_id = ?`).get(playlistId, userId);
};

export const updatePlaylistName = (playlistId, userId, newName) => {
  return db.prepare(`UPDATE playlists SET name = ? WHERE id = ? AND user_id = ?`).run(newName, playlistId, userId);
};

export const deletePlaylist = (playlistId, userId) => {
  return db.prepare(`DELETE FROM playlists WHERE id = ? AND user_id = ?`).run(playlistId, userId);
};

export const getPlaylistTracks = (playlistId, userId) => {
  // Check ownership first
  const playlist = getPlaylistById(playlistId, userId);
  if (!playlist) return null;

  return db.prepare(`
    SELECT t.*, pt.position 
    FROM playlist_tracks pt
    JOIN tracks t ON pt.track_id = t.id
    WHERE pt.playlist_id = ?
    ORDER BY pt.position ASC
  `).all(playlistId);
};

export const addTrackToPlaylist = (playlistId, userId, trackId) => {
  const playlist = getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  const maxPos = db.prepare(`
    SELECT COALESCE(MAX(position), -1) as max_pos 
    FROM playlist_tracks 
    WHERE playlist_id = ?
  `).get(playlistId).max_pos;

  db.prepare(`
    INSERT INTO playlist_tracks (playlist_id, track_id, position)
    VALUES (?, ?, ?)
    ON CONFLICT(playlist_id, track_id) DO NOTHING
  `).run(playlistId, trackId, maxPos + 1);

  return true;
};

export const removeTrackFromPlaylist = (playlistId, userId, trackId) => {
  const playlist = getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  db.prepare(`DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?`).run(playlistId, trackId);
  return true;
};

export const reorderPlaylistTracks = (playlistId, userId, trackIds) => {
  const playlist = getPlaylistById(playlistId, userId);
  if (!playlist) return false;

  const transaction = db.transaction(() => {
    trackIds.forEach((trackId, index) => {
      db.prepare(`
        UPDATE playlist_tracks 
        SET position = ? 
        WHERE playlist_id = ? AND track_id = ?
      `).run(index, playlistId, trackId);
    });
  });

  transaction();
  return true;
};

// --- Favorite Operations ---
export const addFavorite = (userId, trackId) => {
  return db.prepare(`
    INSERT INTO favorites (user_id, track_id)
    VALUES (?, ?)
    ON CONFLICT(user_id, track_id) DO NOTHING
  `).run(userId, trackId);
};

export const removeFavorite = (userId, trackId) => {
  return db.prepare(`DELETE FROM favorites WHERE user_id = ? AND track_id = ?`).run(userId, trackId);
};

export const getUserFavorites = (userId) => {
  return db.prepare(`
    SELECT t.*, f.date_added as favorited_at
    FROM favorites f
    JOIN tracks t ON f.track_id = t.id
    WHERE f.user_id = ?
    ORDER BY f.date_added DESC
  `).all(userId);
};

export const isFavorite = (userId, trackId) => {
  const row = db.prepare(`SELECT 1 FROM favorites WHERE user_id = ? AND track_id = ?`).get(userId, trackId);
  return !!row;
};

// --- Recommendation Telemetry & Data Operations ---
export const logPlayEvent = ({ userId, trackId, listenedSeconds, durationSeconds, isReplay, previousTrackId }) => {
  const listened = parseFloat(listenedSeconds) || 0;
  const duration = parseFloat(durationSeconds) || 0;
  const completionRatio = duration > 0 ? Math.min(1.0, listened / duration) : 0;
  const isSkip = (listened < 15 && duration >= 20 && completionRatio < 0.3) ? 1 : 0;
  const hourOfDay = new Date().getHours();

  db.prepare(`
    INSERT INTO play_logs (user_id, track_id, listened_seconds, duration_seconds, completion_ratio, is_skip, is_replay, hour_of_day)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, trackId, listened, duration, completionRatio, isSkip, isReplay ? 1 : 0, hourOfDay);

  if (previousTrackId && previousTrackId !== trackId) {
    db.prepare(`
      INSERT INTO song_transitions (user_id, from_track_id, to_track_id, transition_count, last_transition_time)
      VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, from_track_id, to_track_id) DO UPDATE SET
        transition_count = transition_count + 1,
        last_transition_time = CURRENT_TIMESTAMP
    `).run(userId, previousTrackId, trackId);
  }
};

export const getPlayLogsForUser = (userId) => {
  return db.prepare(`
    SELECT * FROM play_logs 
    WHERE user_id = ? 
    ORDER BY timestamp DESC 
    LIMIT 2000
  `).all(userId);
};

export const getTransitionsForUser = (userId) => {
  return db.prepare(`
    SELECT * FROM song_transitions 
    WHERE user_id = ?
  `).all(userId);
};
