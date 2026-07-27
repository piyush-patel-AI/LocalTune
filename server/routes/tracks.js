import express from 'express';
import { getAllTracks, getTrackById, getAlbums, getArtists, getArtistImage } from '../db.js';

const router = express.Router();

// GET /api/tracks
router.get('/', (req, res) => {
  const { search, artist, releaseType, sortBy, sortOrder, groupBy } = req.query;

  if (groupBy === 'album') {
    const albums = getAlbums(releaseType);
    return res.json({ albums });
  }

  if (groupBy === 'artist') {
    const artists = getArtists();
    return res.json({ artists });
  }

  const tracks = getAllTracks({ search, artist, releaseType, sortBy, sortOrder });
  return res.json({ tracks });
});

// GET /api/tracks/artist-image/:artistName
router.get('/artist-image/:artistName', (req, res) => {
  const artistName = req.params.artistName;
  const artistImg = getArtistImage(artistName);
  if (!artistImg || !artistImg.image_path) {
    return res.status(404).json({ error: 'No artist image found' });
  }
  return res.sendFile(artistImg.image_path);
});

// GET /api/tracks/:id
router.get('/:id', (req, res) => {
  const trackId = parseInt(req.params.id, 10);
  if (isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID' });
  }

  const track = getTrackById(trackId);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }

  return res.json({ track });
});

// GET /api/tracks/:id/art
router.get('/:id/art', (req, res) => {
  const trackId = parseInt(req.params.id, 10);
  if (isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID' });
  }

  const track = getTrackById(trackId);
  if (!track || !track.cover_art_path) {
    return res.status(404).json({ error: 'No album art found for track' });
  }

  return res.sendFile(track.cover_art_path);
});

export default router;
