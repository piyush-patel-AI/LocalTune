import express from 'express';
import { getUserFavorites, addFavorite, removeFavorite, getTrackById, markRecommendationFavorited } from '../db.js';
import { invalidateRecommendationCache } from '../recommendationEngine.js';

const router = express.Router();

// GET /api/favorites — List user's favorite tracks
router.get('/', async (req, res) => {
  const favorites = await getUserFavorites(req.session.userId);
  return res.json({ favorites });
});

// POST /api/favorites/:trackId — Add track to favorites
router.post('/:trackId', async (req, res) => {
  const trackId = parseInt(req.params.trackId, 10);
  if (isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID.' });
  }

  const track = await getTrackById(trackId);
  if (!track) {
    return res.status(404).json({ error: 'Track not found.' });
  }

  const userId = req.session.userId;
  await addFavorite(userId, trackId);
  await markRecommendationFavorited(userId, trackId, true).catch(() => {});
  invalidateRecommendationCache(userId);
  return res.json({ success: true, message: 'Added to favorites.' });
});

// DELETE /api/favorites/:trackId — Remove track from favorites
router.delete('/:trackId', async (req, res) => {
  const trackId = parseInt(req.params.trackId, 10);
  if (isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID.' });
  }

  const userId = req.session.userId;
  await removeFavorite(userId, trackId);
  await markRecommendationFavorited(userId, trackId, false).catch(() => {});
  invalidateRecommendationCache(userId);
  return res.json({ success: true, message: 'Removed from favorites.' });
});

export default router;
