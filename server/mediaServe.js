/**
 * server/mediaServe.js
 *
 * Serves stored images (artwork / artist photos / avatars) via Supabase Storage.
 * Replaces the B2-based implementation.
 */

import fs from 'fs';
import path from 'path';
import { getSignedUrl, isStorageConfigured } from './storage.js';

export async function serveStoredImage(res, storedPath, fallbackLocalFile = null) {
  const sendFallback = () => {
    if (fallbackLocalFile && fs.existsSync(fallbackLocalFile)) {
      return res.sendFile(fallbackLocalFile);
    }
    return res.status(404).json({ error: 'Image not found' });
  };

  if (!storedPath) {
    return sendFallback();
  }

  if (!isStorageConfigured()) {
    return sendFallback();
  }

  try {
    const url = await getSignedUrl(storedPath, 3600);
    if (!url) {
      return sendFallback();
    }
    // Signed URLs expire — never let browsers cache the redirect itself.
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, url);
  } catch (err) {
    console.error('[Media] Failed to resolve storage URL:', err.message);
    return res.status(502).json({ error: 'Failed to resolve media URL.' });
  }
}
