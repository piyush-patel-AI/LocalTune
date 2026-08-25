import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  updatePlaylistName,
  updatePlaylistCover,
  deletePlaylist,
  getPlaylistTracks,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks
} from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLAYLIST_COVERS_DIR = path.join(__dirname, '../music/playlist_covers');
if (!fs.existsSync(PLAYLIST_COVERS_DIR)) {
  fs.mkdirSync(PLAYLIST_COVERS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, PLAYLIST_COVERS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
    cb(null, `playlist_cover_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

const router = express.Router();

// GET /api/playlists — List user's playlists
router.get('/', async (req, res) => {
  const playlists = await getUserPlaylists(req.session.userId);
  return res.json({ playlists });
});

// POST /api/playlists — Create playlist (with optional cover)
router.post('/', upload.single('cover'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required.' });
  }

  const coverPath = req.file ? req.file.path : null;
  const playlistId = await createPlaylist(req.session.userId, name.trim(), coverPath);
  const playlist = await getPlaylistById(playlistId, req.session.userId);
  return res.status(201).json({ playlist });
});

// POST /api/playlists/:id/cover — Upload/update playlist cover
router.post('/:id/cover', upload.single('cover'), async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'Cover image file is required.' });
  }

  // Remove old cover file if it exists
  if (playlist.cover_path && fs.existsSync(playlist.cover_path)) {
    try {
      fs.unlinkSync(playlist.cover_path);
    } catch (e) {
      console.error('Failed to remove old playlist cover:', e);
    }
  }

  await updatePlaylistCover(playlistId, req.session.userId, req.file.path);
  const updated = await getPlaylistById(playlistId, req.session.userId);
  return res.json({ playlist: updated });
});

// GET /api/playlists/:id/cover — Serve custom playlist cover image
router.get('/:id/cover', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  if (!playlist || !playlist.cover_path) {
    return res.status(404).json({ error: 'Playlist cover not found.' });
  }

  if (!fs.existsSync(playlist.cover_path)) {
    return res.status(404).json({ error: 'Playlist cover file missing on server.' });
  }

  return res.sendFile(path.resolve(playlist.cover_path));
});

// GET /api/playlists/:id — Get playlist metadata & tracks
router.get('/:id', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = (await getPlaylistTracks(playlistId, req.session.userId)) || [];
  return res.json({ playlist: { ...playlist, tracks }, tracks });
});

// PATCH /api/playlists/:id — Rename playlist
router.patch('/:id', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const { name } = req.body;

  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'New playlist name is required.' });
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  await updatePlaylistName(playlistId, req.session.userId, name.trim());
  const updated = await getPlaylistById(playlistId, req.session.userId);
  return res.json({ playlist: updated });
});

// DELETE /api/playlists/:id — Delete playlist
router.delete('/:id', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  await deletePlaylist(playlistId, req.session.userId);
  return res.json({ success: true, message: 'Playlist deleted.' });
});

// GET /api/playlists/:id/tracks — Fetch tracks for a playlist
router.get('/:id/tracks', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const tracks = await getPlaylistTracks(playlistId, req.session.userId);
  if (tracks === null) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  return res.json({ tracks });
});

// POST /api/playlists/:id/tracks — Add track to playlist
router.post('/:id/tracks', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const { trackId } = req.body;

  if (isNaN(playlistId) || !trackId) {
    return res.status(400).json({ error: 'Invalid playlist ID or track ID.' });
  }

  const success = await addTrackToPlaylist(playlistId, req.session.userId, parseInt(trackId, 10));
  if (!success) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = await getPlaylistTracks(playlistId, req.session.userId);
  return res.json({ success: true, tracks });
});

// DELETE /api/playlists/:id/tracks/:trackId — Remove track from playlist
router.delete('/:id/tracks/:trackId', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const trackId = parseInt(req.params.trackId, 10);

  if (isNaN(playlistId) || isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid playlist ID or track ID.' });
  }

  const success = await removeTrackFromPlaylist(playlistId, req.session.userId, trackId);
  if (!success) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = await getPlaylistTracks(playlistId, req.session.userId);
  return res.json({ success: true, tracks });
});

// PATCH /api/playlists/:id/reorder — Reorder tracks in playlist
router.patch('/:id/reorder', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const { trackIds } = req.body;

  if (isNaN(playlistId) || !Array.isArray(trackIds)) {
    return res.status(400).json({ error: 'Invalid playlist ID or trackIds array.' });
  }

  const success = await reorderPlaylistTracks(playlistId, req.session.userId, trackIds.map(id => parseInt(id, 10)));
  if (!success) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = await getPlaylistTracks(playlistId, req.session.userId);
  return res.json({ success: true, tracks });
});

export default router;
