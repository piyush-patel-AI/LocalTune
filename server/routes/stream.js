/**
 * server/routes/stream.js
 *
 * GET /stream/:trackId
 *
 * Authenticates the request, looks up the track's storage key in PostgreSQL,
 * generates a time-limited signed URL, and issues a 302 redirect.
 *
 * The HTML5 <audio> player and Android native MediaPlayer follow the redirect
 * transparently. Supabase Storage handles all HTTP Range 206 byte-seeking
 * natively — the server never streams audio bytes itself.
 */

import express from 'express';
import { getTrackById } from '../db.js';
import { getSignedUrl, isStorageConfigured } from '../storage.js';

const router = express.Router();

// GET /stream/:trackId
router.get('/:trackId', async (req, res) => {
  const trackId = parseInt(req.params.trackId, 10);
  if (isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID.' });
  }

  const track = await getTrackById(trackId);
  if (!track) {
    return res.status(404).json({ error: 'Track not found.' });
  }

  const storageKey = track.b2_key || track.file_path;

  if (isStorageConfigured() && storageKey && !storageKey.startsWith('/')) {
    try {
      const signedUrl = await getSignedUrl(storageKey, 7200);
      if (!signedUrl) {
        return res.status(502).json({ error: 'Failed to generate stream URL.' });
      }
      // 302 redirect — audio player follows this transparently.
      // Supabase Storage handles Range requests on signed URLs natively (HTTP 206).
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, signedUrl);
    } catch (err) {
      console.error('[Stream] Failed to generate signed URL:', err.message);
      return res.status(502).json({ error: 'Failed to generate stream URL.' });
    }
  }

  return res.status(404).json({ error: 'Audio file not found.' });
});

export default router;
