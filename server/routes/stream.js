import express from 'express';
import fs from 'fs';
import { getTrackById } from '../db.js';

const router = express.Router();

const MIME_TYPES = {
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  aac: 'audio/aac'
};

// GET /stream/:trackId — Stream track with HTTP Range support
router.get('/:trackId', (req, res) => {
  const trackId = parseInt(req.params.trackId, 10);
  if (isNaN(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID.' });
  }

  const track = getTrackById(trackId);
  if (!track) {
    return res.status(404).json({ error: 'Track not found.' });
  }

  const filePath = track.file_path;
  if (!fs.existsSync(filePath)) {
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
      res.writeHead(416, {
        'Content-Range': `bytes */${fileSize}`,
        'Accept-Ranges': 'bytes'
      });
      return res.end();
    }

    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': mimeType,
      'Cache-Control': 'no-cache'
    });

    file.on('error', (err) => {
      console.error('[Stream File Error]', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });

    const file = fs.createReadStream(filePath);
    file.on('error', (err) => {
      console.error('[Stream File Error]', err);
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    file.pipe(res);
  }
});

export default router;
