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
    // The underlying stored object is immutable per track/artist, and the signed
    // URL is valid for ~1h. Cache the redirect for a window safely under the
    // signed-URL TTL so the browser can serve repeat artwork straight from its
    // HTTP cache — no DB lookup (getTrackById) and no Supabase signing call on
    // every artwork request. We stay well under the 3600s signed TTL and use
    // stale-while-revalidate so a briefly stale redirect still resolves to a
    // valid signed URL. Artwork is not personalized/session-sensitive, so
    // public caching is safe.
    res.setHeader('Cache-Control', 'public, max-age=3000, stale-while-revalidate=86400');
    return res.redirect(302, url);
  } catch (err) {
    console.error('[Media] Failed to resolve storage URL:', err.message);
    return res.status(502).json({ error: 'Failed to resolve media URL.' });
  }
}
