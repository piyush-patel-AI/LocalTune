import express from 'express';
import { getAllTracks, getTrackById, getAlbums, getArtists, getArtistImage, getUserFavorites } from '../db.js';
import { generateRecommendations } from '../recommendationEngine.js';

const router = express.Router();

// GET /api/tracks/recommendations
router.get('/recommendations', (req, res) => {
  try {
    const userId = req.user ? req.user.id : (req.session && req.session.userId ? req.session.userId : 1);
    const currentTrackId = req.query.currentTrackId ? parseInt(req.query.currentTrackId, 10) : null;
    const allTracks = getAllTracks({});

    let favoritesMap = {};
    if (userId) {
      const favs = getUserFavorites(userId);
      favs.forEach((f) => {
        favoritesMap[f.id] = true;
      });
    }

    const recommendedTracks = generateRecommendations({
      allTracks,
      favoritesMap,
      userId,
      currentTrackId
    });

    return res.json({ tracks: recommendedTracks });
  } catch (err) {
    console.error('Error generating recommendations:', err);
    return res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

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
