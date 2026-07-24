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
  const existing = db.prepare(`SELECT id, date_modified, cover_art_path FROM tracks WHERE file_path = ?`).get(track.filePath);
  const coverArt = track.coverArtPath !== undefined ? track.coverArtPath : (existing ? existing.cover_art_path : null);

  if (existing) {
    const stmt = db.prepare(`
      UPDATE tracks 
      SET title = ?, artist = ?, album = ?, duration_seconds = ?, format = ?, file_size = ?, date_modified = ?, cover_art_path = ?
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
      track.filePath
    );
    return existing.id;
  } else {
    const stmt = db.prepare(`
      INSERT INTO tracks (file_path, title, artist, album, duration_seconds, format, file_size, date_modified, cover_art_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      coverArt
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
  const { search, sortBy = 'title', sortOrder = 'ASC' } = options;
  let sql = `SELECT * FROM tracks`;
  const params = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    sql += ` WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?`;
    params.push(term, term, term);
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

export const getAlbums = () => {
  return db.prepare(`
    SELECT 
      album, 
      artist, 
      COUNT(*) as track_count,
      MAX(cover_art_path) as cover_art_path,
      MAX(CASE WHEN cover_art_path IS NOT NULL THEN id ELSE id END) as sample_track_id
    FROM tracks 
    GROUP BY album, artist 
    ORDER BY album ASC
  `).all();
};

export const getArtists = () => {
  return db.prepare(`
    WITH all_artist_names AS (
      SELECT artist as name FROM tracks WHERE artist IS NOT NULL AND TRIM(artist) != ''
      UNION
      SELECT artist_name as name FROM artist_images WHERE artist_name IS NOT NULL AND TRIM(artist_name) != ''
    )
    SELECT 
      a.name as artist, 
      COUNT(DISTINCT t.id) as track_count, 
      COUNT(DISTINCT t.album) as album_count,
      ai.image_path as artist_image_path
    FROM all_artist_names a
    LEFT JOIN tracks t ON (LOWER(t.artist) = LOWER(a.name) OR LOWER(t.artist) LIKE '%' || LOWER(a.name) || '%')
    LEFT JOIN artist_images ai ON LOWER(ai.artist_name) = LOWER(a.name)
    GROUP BY a.name 
    ORDER BY a.name ASC
  `).all();
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
