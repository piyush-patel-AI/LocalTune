import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getScanStatus, scanLibrary } from '../scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /api/scan/status
router.get('/status', (req, res) => {
  res.json(getScanStatus());
});

// POST /api/scan
router.post('/', (req, res) => {
  const musicDir = process.env.MUSIC_DIR || path.join(__dirname, '../music');
  
  // Non-blocking trigger
  scanLibrary(musicDir).catch(err => {
    console.error('[Scan Route Error]', err);
  });

  return res.json({ success: true, message: 'Scan started asynchronously' });
});

export default router;
