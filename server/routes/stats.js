import express from 'express';
import db, { logPlayEvent } from '../db.js';

const router = express.Router();

// GET /api/stats - Library overview counts
router.get('/', (req, res) => {
  try {
    const totalTracks = db.prepare('SELECT COUNT(*) AS count FROM tracks').get()?.count || 0;
    const totalArtists = db.prepare('SELECT COUNT(DISTINCT artist) AS count FROM tracks').get()?.count || 0;
    const totalAlbums = db.prepare('SELECT COUNT(DISTINCT album) AS count FROM tracks WHERE album IS NOT NULL AND TRIM(album) != ""').get()?.count || 0;

    res.json({
      totalTracks,
      totalArtists,
      totalAlbums
    });
  } catch (err) {
    console.error('Error fetching library stats:', err);
    res.status(500).json({ error: 'Failed to fetch library stats' });
  }
});

// POST /api/stats/listen
router.post('/listen', (req, res) => {
  try {
    const userId = req.user ? req.user.id : (req.session && req.session.userId ? req.session.userId : 1);
    const { trackId, listenedSeconds, durationSeconds, isReplay, previousTrackId } = req.body;

    if (!trackId) {
      return res.status(400).json({ error: 'trackId is required' });
    }

    logPlayEvent({
      userId: userId || 1,
      trackId: parseInt(trackId, 10),
      listenedSeconds: parseFloat(listenedSeconds) || 0,
      durationSeconds: parseFloat(durationSeconds) || 0,
      isReplay: !!isReplay,
      previousTrackId: previousTrackId ? parseInt(previousTrackId, 10) : null
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Error logging play event:', err);
    return res.status(500).json({ error: 'Failed to log play event' });
  }
});

export default router;
