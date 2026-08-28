/**
 * server/mediaServe.js
 *
 * Serves stored images (artwork / artist photos / avatars) via Supabase Storage.
 * Replaces the B2-based implementation.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getBufferFromStorage, isStorageConfigured } from './storage.js';

const ARTWORK_MAX_AGE = 31536000; // 1 year

function contentTypeFromPath(storagePath) {
  const ext = (String(storagePath).split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    case 'gif': return 'image/gif';
    case 'avif': return 'image/avif';
    default: return 'image/jpeg';
  }
}

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
    // Fetch the bytes server-side. The signed URL never reaches the browser, so the
    // Storage bucket stays private while the browser only ever sees this stable,
    // same-origin URL. That lets its HTTP cache reuse the artwork across view
    // navigations (Explore -> Home -> Library -> Home) instead of re-downloading.
    const buf = await getBufferFromStorage(storedPath);
    if (!buf) {
      return sendFallback();
    }

    const etag = `"${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32)}"`;
    const ifNoneMatch = res.req && res.req.headers && res.req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      return res.status(304).end();
    }

    // Artwork is immutable per track/artist/avatar and is not personalized or
    // session-sensitive, so public, long-lived caching is safe.
    res.setHeader('Cache-Control', `public, max-age=${ARTWORK_MAX_AGE}, immutable`);
    res.setHeader('ETag', etag);
    res.setHeader('Content-Type', contentTypeFromPath(storedPath));
    res.setHeader('Content-Length', buf.length);
    return res.status(200).send(buf);
  } catch (err) {
    console.error('[Media] Failed to serve stored image:', err.message);
    return res.status(502).json({ error: 'Failed to serve media.' });
  }
}
