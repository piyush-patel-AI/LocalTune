import express from 'express';
import { getLibraryStats, logPlayEvent } from '../db.js';
import { invalidateRecommendationCache } from '../recommendationEngine.js';

const router = express.Router();

// GET /api/stats - Library overview counts
router.get('/', async (req, res) => {
  try {
    const stats = await getLibraryStats();

    res.json({
      totalTracks: stats.totalTracks,
      totalArtists: stats.totalArtists,
      totalAlbums: stats.totalAlbums
    });
  } catch (err) {
    console.error('Error fetching library stats:', err);
    res.status(500).json({ error: 'Failed to fetch library stats' });
  }
});

// POST /api/stats/listen
router.post('/listen', async (req, res) => {
  try {
    const userId = req.user ? req.user.id : (req.session && req.session.userId ? req.session.userId : 1);
    const {
      trackId, listenedSeconds, durationSeconds, isReplay, previousTrackId,
      playOrigin, sessionId
    } = req.body;

    if (!trackId) {
      return res.status(400).json({ error: 'trackId is required' });
    }

    await logPlayEvent({
      userId: userId || 1,
      trackId: parseInt(trackId, 10),
      listenedSeconds: parseFloat(listenedSeconds) || 0,
      durationSeconds: parseFloat(durationSeconds) || 0,
      isReplay: !!isReplay,
      previousTrackId: previousTrackId ? parseInt(previousTrackId, 10) : null,
      playOrigin: playOrigin || 'manual',
      sessionId: sessionId || null
    });

    // A completed play changes the user's listening profile; drop stale recs.
    invalidateRecommendationCache(userId || 1);

    return res.json({ success: true });
  } catch (err) {
    console.error('Error logging play event:', err);
    return res.status(500).json({ error: 'Failed to log play event' });
  }
});

export default router;
