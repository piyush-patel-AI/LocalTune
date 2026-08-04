import express from 'express';
import {
  getAllTracks,
  getTrackById,
  getAlbums,
  getArtists,
  getArtistImage,
  getUserFavorites,
  updateTrackMetadata,
  resetTrackMetadata,
  bulkUpdateTrackMetadata,
  logRecommendationAction
} from '../db.js';
import {
  generateRecommendations,
  generateShelves,
  generateDiscoveryRadar,
  generateForgottenFavorites,
  generateAutoplayTracks,
  invalidateRecommendationCache
} from '../recommendationEngine.js';
import { scanMissingMetadata } from '../scanner.js';
import { normalizeGenre } from '../genreNormalizer.js';

const router = express.Router();

// Helper to get active user ID
function getActiveUserId(req) {
  return req.user ? req.user.id : (req.session && req.session.userId ? req.session.userId : 1);
}

// Helper to build user's favorites map
function getFavoritesMap(userId) {
  const favoritesMap = {};
  if (userId) {
    const favs = getUserFavorites(userId);
    favs.forEach((f) => {
      favoritesMap[f.id] = true;
    });
  }
  return favoritesMap;
}

// GET /api/tracks/recommendations/shelves
router.get('/recommendations/shelves', (req, res) => {
  try {
    const userId = getActiveUserId(req);
    const currentTrackId = req.query.currentTrackId ? parseInt(req.query.currentTrackId, 10) : null;
    const allTracks = getAllTracks({});
    const favoritesMap = getFavoritesMap(userId);

    const shelves = generateShelves({
      allTracks,
      favoritesMap,
      userId,
      currentTrackId
    });

    return res.json({ shelves });
  } catch (err) {
    console.error('Error generating recommendation shelves:', err);
    return res.status(500).json({ error: 'Failed to generate recommendation shelves' });
  }
});

// GET /api/tracks/recommendations/discovery
router.get('/recommendations/discovery', (req, res) => {
  try {
    const userId = getActiveUserId(req);
    const allTracks = getAllTracks({});
    const favoritesMap = getFavoritesMap(userId);
    const tracks = generateDiscoveryRadar({ allTracks, favoritesMap, userId });
    return res.json({ tracks });
  } catch (err) {
    console.error('Error generating discovery radar:', err);
    return res.status(500).json({ error: 'Failed to generate discovery radar' });
  }
});

// GET /api/tracks/recommendations/forgotten
router.get('/recommendations/forgotten', (req, res) => {
  try {
    const userId = getActiveUserId(req);
    const allTracks = getAllTracks({});
    const favoritesMap = getFavoritesMap(userId);
    const tracks = generateForgottenFavorites({ allTracks, favoritesMap, userId });
    return res.json({ tracks });
  } catch (err) {
    console.error('Error generating forgotten favorites:', err);
    return res.status(500).json({ error: 'Failed to generate forgotten favorites' });
  }
});

// GET /api/tracks/recommendations/autoplay
router.get('/recommendations/autoplay', (req, res) => {
  try {
    const userId = getActiveUserId(req);
    const currentTrackId = req.query.currentTrackId ? parseInt(req.query.currentTrackId, 10) : null;
    const excludeTrackIds = req.query.exclude ? req.query.exclude.split(',').map((id) => parseInt(id, 10)).filter(Boolean) : [];
    const count = req.query.count ? parseInt(req.query.count, 10) : 5;

    const allTracks = getAllTracks({});
    const favoritesMap = getFavoritesMap(userId);

    const tracks = generateAutoplayTracks({
      allTracks,
      favoritesMap,
      userId,
      currentTrackId,
      excludeTrackIds,
      count
    });

    return res.json({ tracks });
  } catch (err) {
    console.error('Error generating autoplay tracks:', err);
    return res.status(500).json({ error: 'Failed to generate autoplay tracks' });
  }
});

// POST /api/tracks/recommendations/log
router.post('/recommendations/log', (req, res) => {
  try {
    const userId = getActiveUserId(req);
    const { trackId, shelfId, action } = req.body;
    if (!trackId || !action) {
      return res.status(400).json({ error: 'Missing trackId or action' });
    }

    logRecommendationAction({ userId, trackId, shelfId, action });
    return res.json({ success: true });
  } catch (err) {
    console.error('Error logging recommendation action:', err);
    return res.status(500).json({ error: 'Failed to log recommendation action' });
  }
});

// GET /api/tracks/recommendations (Legacy single endpoint)
router.get('/recommendations', (req, res) => {
  try {
    const userId = getActiveUserId(req);
    const currentTrackId = req.query.currentTrackId ? parseInt(req.query.currentTrackId, 10) : null;
    const allTracks = getAllTracks({});
    const favoritesMap = getFavoritesMap(userId);

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

// POST /api/tracks/scan-missing-metadata ("Rescan Metadata Only")
router.post('/scan-missing-metadata', async (req, res) => {
  try {
    const result = await scanMissingMetadata();
    invalidateRecommendationCache();
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error rescanning missing metadata:', err);
    return res.status(500).json({ error: 'Failed to rescan missing metadata' });
  }
});

// PATCH /api/tracks/bulk-edit (Bulk Edit Metadata)
router.patch('/bulk-edit', (req, res) => {
  try {
    const { trackIds, genre, year, artist, album } = req.body;
    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return res.status(400).json({ error: 'Must provide an array of trackIds' });
    }

    const normGenre = genre !== undefined ? (genre ? normalizeGenre(genre) : null) : undefined;
    const count = bulkUpdateTrackMetadata(trackIds, {
      genre: normGenre,
      year,
      artist,
      album
    });

    invalidateRecommendationCache();
    return res.json({ success: true, updatedCount: count });
  } catch (err) {
    console.error('Error bulk updating metadata:', err);
    return res.status(500).json({ error: 'Failed to bulk update metadata' });
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

// PATCH /api/tracks/:id (Single track metadata update)
router.patch('/:id', (req, res) => {
  try {
    const trackId = parseInt(req.params.id, 10);
    if (isNaN(trackId)) {
      return res.status(400).json({ error: 'Invalid track ID' });
    }

    const { title, artist, album, genre, year, language, composer, comment, rating, tags } = req.body;
    const normGenre = genre !== undefined ? (genre ? normalizeGenre(genre) : null) : undefined;

    const updatedTrack = updateTrackMetadata(trackId, {
      title,
      artist,
      album,
      genre: normGenre,
      year,
      language,
      composer,
      comment,
      rating,
      tags
    });

    if (!updatedTrack) {
      return res.status(404).json({ error: 'Track not found' });
    }

    invalidateRecommendationCache();
    return res.json({ success: true, track: updatedTrack });
  } catch (err) {
    console.error('Error updating track metadata:', err);
    return res.status(500).json({ error: 'Failed to update track metadata' });
  }
});

// POST /api/tracks/:id/reset-metadata (Reset metadata to original)
router.post('/:id/reset-metadata', (req, res) => {
  try {
    const trackId = parseInt(req.params.id, 10);
    if (isNaN(trackId)) {
      return res.status(400).json({ error: 'Invalid track ID' });
    }

    const resetTrack = resetTrackMetadata(trackId);
    if (!resetTrack) {
      return res.status(404).json({ error: 'Track not found' });
    }

    invalidateRecommendationCache();
    return res.json({ success: true, track: resetTrack });
  } catch (err) {
    console.error('Error resetting track metadata:', err);
    return res.status(500).json({ error: 'Failed to reset track metadata' });
  }
});

export default router;
