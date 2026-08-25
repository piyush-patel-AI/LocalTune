/**
 * server/mediaServe.js
 *
 * Serves stored images (artwork / artist photos / avatars) regardless of
 * where they live:
 *  - B2 object key  -> 302 redirect to the CDN/public URL or a presigned URL
 *  - legacy abs path -> sendFile from disk (local dev fallback)
 */

import fs from 'fs';
import path from 'path';
import { isB2Configured, resolveMediaUrl, isLocalPath } from './b2.js';

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

  // --- B2 object key ---
  if (!isLocalPath(storedPath)) {
    if (!isB2Configured()) {
      return sendFallback();
    }
    try {
      const url = await resolveMediaUrl(storedPath);
      if (!url) {
        return sendFallback();
      }
      // Signed URLs expire — never let browsers cache the redirect itself.
      // The redirected B2 response carries its own caching headers.
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, url);
    } catch (err) {
      console.error('[Media] Failed to resolve B2 URL:', err.message);
      return res.status(502).json({ error: 'Failed to resolve media URL.' });
    }
  }

  // --- Legacy local filesystem path ---
  if (!fs.existsSync(storedPath)) {
    return sendFallback();
  }
  return res.sendFile(path.resolve(storedPath));
}
