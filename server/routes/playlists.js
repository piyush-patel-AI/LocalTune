import express from 'express';
import {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  updatePlaylistName,
  deletePlaylist,
  getPlaylistTracks,
  addTrackToPlaylist,
  removeTrackFromPlaylist,
  reorderPlaylistTracks
} from '../db.js';

const router = express.Router();

// GET /api/playlists — List user's playlists
router.get('/', (req, res) => {
  const playlists = getUserPlaylists(req.session.userId);
  return res.json({ playlists });
});

// POST /api/playlists — Create playlist
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Playlist name is required.' });
  }

  const playlistId = createPlaylist(req.session.userId, name.trim());
  const playlist = getPlaylistById(playlistId, req.session.userId);
  return res.status(201).json({ playlist });
});

// GET /api/playlists/:id — Get playlist metadata & tracks
router.get('/:id', (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = getPlaylistTracks(playlistId, req.session.userId);
  return res.json({ playlist, tracks });
});

// PATCH /api/playlists/:id — Rename playlist
router.patch('/:id', (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const { name } = req.body;

  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'New playlist name is required.' });
  }

  const playlist = getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  updatePlaylistName(playlistId, req.session.userId, name.trim());
  const updated = getPlaylistById(playlistId, req.session.userId);
  return res.json({ playlist: updated });
});

// DELETE /api/playlists/:id — Delete playlist
router.delete('/:id', (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const playlist = getPlaylistById(playlistId, req.session.userId);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  deletePlaylist(playlistId, req.session.userId);
  return res.json({ success: true, message: 'Playlist deleted.' });
});

// GET /api/playlists/:id/tracks — Fetch tracks for a playlist
router.get('/:id/tracks', (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  if (isNaN(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID.' });
  }

  const tracks = getPlaylistTracks(playlistId, req.session.userId);
  if (tracks === null) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  return res.json({ tracks });
});

// POST /api/playlists/:id/tracks — Add track to playlist
router.post('/:id/tracks', (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const { trackId } = req.body;

  if (isNaN(playlistId) || !trackId) {
    return res.status(400).json({ error: 'Invalid playlist ID or track ID.' });
  }

  const success = addTrackToPlaylist(playlistId, req.session.userId, parseInt(trackId, 10));
  if (!success) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = getPlaylistTracks(playlistId, req.session.userId);
  return res.json({ success: true, tracks });
});

// DELETE /api/playlists/:id/tracks/:trackId — Remove track from playlist
router.delete('/:id/tracks/:trackId', (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const trackId = parseInt(req.params.trackId, 10);

  if (isNaN(playlistId) || isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid playlist ID or track ID.' });
  }

  const success = removeTrackFromPlaylist(playlistId, req.session.userId, trackId);
  if (!success) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = getPlaylistTracks(playlistId, req.session.userId);
  return res.json({ success: true, tracks });
});

// PATCH /api/playlists/:id/reorder — Reorder tracks in playlist
router.patch('/:id/reorder', (req, res) => {
  const playlistId = parseInt(req.params.id, 10);
  const { trackIds } = req.body;

  if (isNaN(playlistId) || !Array.isArray(trackIds)) {
    return res.status(400).json({ error: 'Invalid playlist ID or trackIds array.' });
  }

  const success = reorderPlaylistTracks(playlistId, req.session.userId, trackIds.map(id => parseInt(id, 10)));
  if (!success) {
    return res.status(404).json({ error: 'Playlist not found or access denied.' });
  }

  const tracks = getPlaylistTracks(playlistId, req.session.userId);
  return res.json({ success: true, tracks });
});

export default router;
