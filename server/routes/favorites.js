import express from 'express';
import { getUserFavorites, addFavorite, removeFavorite, getTrackById } from '../db.js';

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

  await addFavorite(req.session.userId, trackId);
  return res.json({ success: true, message: 'Added to favorites.' });
});

// DELETE /api/favorites/:trackId — Remove track from favorites
router.delete('/:trackId', async (req, res) => {
  const trackId = parseInt(req.params.trackId, 10);
  if (isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID.' });
  }

  await removeFavorite(req.session.userId, trackId);
  return res.json({ success: true, message: 'Removed from favorites.' });
});

export default router;
