/**
 * server/routes/stream.js
 *
 * GET /stream/:trackId
 *
 * Authenticates the request, looks up the track's B2 key in SQLite,
 * generates a time-limited presigned URL, and issues a 302 redirect.
 *
 * The HTML5 <audio> player and Android native MediaPlayer follow the redirect
 * transparently. B2 / Cloudflare Edge handles all HTTP Range 206 byte-seeking
 * natively — Render never streams audio bytes itself.
 *
 * Falls back to local fs streaming if B2_ENDPOINT is not configured
 * (for local development without B2 credentials).
 */

import express from 'express';
import fs from 'fs';
import { getTrackById } from '../db.js';
import { getPresignedStreamUrl, isB2Configured } from '../b2.js';

const router = express.Router();

const MIME_TYPES = {
  mp3:  'audio/mpeg',
  flac: 'audio/flac',
  wav:  'audio/wav',
  m4a:  'audio/mp4',
  ogg:  'audio/ogg',
  aac:  'audio/aac'
};

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

  // --- B2 Path (production): redirect to presigned URL ---
  const b2Key = track.b2_key || track.file_path;

  if (isB2Configured() && b2Key && !b2Key.startsWith('/')) {
    try {
      const presignedUrl = await getPresignedStreamUrl(b2Key, 7200);
      // 302 redirect — audio player follows this transparently.
      // B2 handles Range requests on presigned URLs natively (HTTP 206).
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, presignedUrl);
    } catch (err) {
      console.error('[Stream] Failed to generate presigned URL:', err.message);
      return res.status(502).json({ error: 'Failed to generate stream URL.' });
    }
  }

  // --- Local fallback (development without B2) ---
  const filePath = track.file_path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Audio file not found on disk.' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const format = (track.format || '').replace('.', '').toLowerCase();
  const mimeType = MIME_TYPES[format] || 'audio/mpeg';
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}`, 'Accept-Ranges': 'bytes' });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunksize,
      'Content-Type':   mimeType,
      'Cache-Control':  'no-cache'
    });
    file.on('error', (err) => { console.error('[Stream]', err); if (!res.headersSent) res.status(500).end(); });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type':   mimeType,
      'Accept-Ranges':  'bytes',
      'Cache-Control':  'no-cache'
    });
    const file = fs.createReadStream(filePath);
    file.on('error', (err) => { console.error('[Stream]', err); if (!res.headersSent) res.status(500).end(); });
    file.pipe(res);
  }
});

export default router;
