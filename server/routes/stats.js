import express from 'express';
import { logPlayEvent } from '../db.js';

const router = express.Router();

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
