import express from 'express';
import multer from 'multer';
import path from 'path';
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
import { uploadToStorage, deleteFromStorage, getSignedUrl, extFromMime, isStorageConfigured } from '../storage.js';
import { serveStoredImage } from '../mediaServe.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const router = express.Router();

function buildPlaylistCoverKey(playlistId, ext) {
  return `playlist_covers/${playlistId}.${ext}`;
}

router.get('/', async (req, res) => {
  const playlists = await getUserPlaylists(req.session.userId);
  return res.json({ playlists });
});

router.post('/', upload.single('cover'), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required.' });
  }

  let coverPath = null;
  if (req.file && isStorageConfigured()) {
    const ext = extFromMime(req.file.mimetype);
    const tempKey = `playlist_covers/temp_${Date.now()}.${ext}`;
    await uploadToStorage(tempKey, req.file.buffer, req.file.mimetype || 'image/jpeg');
    coverPath = tempKey;
  }

  const playlistId = await createPlaylist(req.session.userId, name.trim(), coverPath);

  if (coverPath && coverPath.startsWith('playlist_covers/temp_')) {
    const finalKey = buildPlaylistCoverKey(playlistId, extFromMime(req.file.mimetype));
    await deleteFromStorage(coverPath);
    await uploadToStorage(finalKey, req.file.buffer, req.file.mimetype || 'image/jpeg');
    await updatePlaylistCover(playlistId, req.session.userId, finalKey);
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  return res.status(201).json({ playlist });
});

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

  if (playlist.cover_path) {
    await deleteFromStorage(playlist.cover_path).catch(() => {});
  }

  const ext = extFromMime(req.file.mimetype);
  const key = buildPlaylistCoverKey(playlistId, ext);
  await uploadToStorage(key, req.file.buffer, req.file.mimetype || 'image/jpeg');

  await updatePlaylistCover(playlistId, req.session.userId, key);
  const updated = await getPlaylistById(playlistId, req.session.userId);
  return res.json({ playlist: updated });
});

router.get('/:id/cover', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  if (!playlist || !playlist.cover_path) {
    return res.status(404).json({ error: 'Playlist cover not found.' });
  }

  return await serveStoredImage(res, playlist.cover_path);
});

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

router.delete('/:id', async (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = await getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  if (playlist.cover_path) {
    await deleteFromStorage(playlist.cover_path).catch(() => {});
  }

  await deletePlaylist(playlistId, req.session.userId);
  return res.json({ success: true, message: 'Playlist deleted.' });
});

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
