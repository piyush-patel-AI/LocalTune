/**
 * server/storage.js
 *
 * Supabase Storage client — replaces server/b2.js entirely.
 * All B2 object operations (presigned URLs, upload, delete, list, download)
 * are now handled via Supabase Storage.
 *
 * Key structure is preserved from B2:
 *   music/{artist}/{album}/{filename}.mp3
 *   artworks/{trackId}.{ext}
 *   artists/{name}.{ext}
 *   avatars/{userId}.{ext}
 */

import { supabaseAdmin, STORAGE_BUCKET } from './supabase.js';

// ============================================================
// URL Resolution
// ============================================================

/**
 * Generate a signed URL for a stored object.
 * @param {string} storagePath - Object key (e.g. "music/Artist/Album/song.mp3")
 * @param {number} expiresIn - Seconds until URL expires (default: 7200 = 2h)
 * @returns {string|null} Signed URL or null on error
 */
export async function getSignedUrl(storagePath, expiresIn = 7200) {
  if (!storagePath) return null;
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storagePath, expiresIn);

    if (error || !data?.signedUrl) {
      console.error('[Storage] Failed to create signed URL:', error?.message || 'No URL returned');
      return null;
    }
    return data.signedUrl;
  } catch (err) {
    console.error('[Storage] Signed URL error:', err.message);
    return null;
  }
}

/**
 * Resolve a storage path to a URL (alias for getSignedUrl).
 * Matches the old b2.js resolveMediaUrl() signature.
 */
export const resolveMediaUrl = getSignedUrl;

// ============================================================
// Upload
// ============================================================

/**
 * Upload a buffer to Supabase Storage.
 * @param {string} storagePath - Object key
 * @param {Buffer} buffer - File content
 * @param {string} contentType - MIME type
 * @param {object} options - { upsert: true }
 * @returns {{ path: string } | null}
 */
export async function uploadToStorage(storagePath, buffer, contentType, options = {}) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: options.upsert ?? false,
      });

    if (error) {
      console.error('[Storage] Upload error:', error.message);
      return null;
    }
    return { path: data?.path || storagePath };
  } catch (err) {
    console.error('[Storage] Upload exception:', err.message);
    return null;
  }
}

/**
 * Upload with verification: upload + confirm the object exists with correct size.
 * @param {string} storagePath
 * @param {Buffer} buffer
 * @param {string} contentType
 * @returns {{ path: string, verified: boolean } | null}
 */
export async function uploadToStorageVerified(storagePath, buffer, contentType) {
  const result = await uploadToStorage(storagePath, buffer, contentType, { upsert: true });
  if (!result) {
    throw new Error(`Storage upload failed: ${storagePath}`);
  }

  const verified = await existsInStorage(storagePath);
  if (!verified) {
    throw new Error(`Storage upload verification failed: ${storagePath}`);
  }

  return { path: result.path, verified };
}

// ============================================================
// Download
// ============================================================

/**
 * Download an object from Supabase Storage as a Buffer.
 * @param {string} storagePath - Object key
 * @returns {Buffer|null}
 */
export async function getBufferFromStorage(storagePath) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(storagePath);

    if (error || !data) {
      console.error('[Storage] Download error:', error?.message || 'No data');
      return null;
    }
    return Buffer.from(await data.arrayBuffer());
  } catch (err) {
    console.error('[Storage] Download exception:', err.message);
    return null;
  }
}

// ============================================================
// Delete
// ============================================================

/**
 * Delete an object from Supabase Storage.
 * @param {string} storagePath - Object key
 * @returns {boolean}
 */
export async function deleteFromStorage(storagePath) {
  if (!storagePath) return false;
  try {
    const { error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .remove([storagePath]);

    if (error) {
      console.error('[Storage] Delete error:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Storage] Delete exception:', err.message);
    return false;
  }
}

// ============================================================
// Existence Check
// ============================================================

/**
 * Check if an object exists in Supabase Storage.
 * @param {string} storagePath - Object key
 * @returns {boolean}
 */
export async function existsInStorage(storagePath) {
  if (!storagePath) return false;
  try {
    const parts = storagePath.split('/');
    const filename = parts.pop();
    const dirPath = parts.join('/');

    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .list(dirPath || '', {
        search: filename,
        limit: 100,
      });

    if (error || !data) return false;

    return data.some(obj => {
      const objPath = dirPath ? `${dirPath}/${obj.name}` : obj.name;
      return objPath === storagePath;
    });
  } catch (err) {
    console.error('[Storage] Exists check error:', err.message);
    return false;
  }
}

/**
 * Get file info (size, last modified) from Supabase Storage.
 * @param {string} storagePath
 * @returns {{ size: number, lastModified: string } | null}
 */
export async function getFileInfo(storagePath) {
  if (!storagePath) return null;
  try {
    const parts = storagePath.split('/');
    const filename = parts.pop();
    const dirPath = parts.join('/');

    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .list(dirPath || '', {
        search: filename,
        limit: 100,
      });

    if (error || !data) return null;

    const match = data.find(obj => {
      const objPath = dirPath ? `${dirPath}/${obj.name}` : obj.name;
      return objPath === storagePath;
    });

    if (!match) return null;

    return {
      size: match.metadata?.size || match.size || 0,
      lastModified: match.updated_at || match.created_at,
    };
  } catch (err) {
    console.error('[Storage] Get file info error:', err.message);
    return null;
  }
}

// ============================================================
// List
// ============================================================

/**
 * List objects in a Supabase Storage directory.
 * @param {string} prefix - Directory prefix (e.g. "music/Artist/Album/")
 * @param {object} options - { limit, offset, search }
 * @returns {Array<{ name: string, id: string, metadata: object }>}
 */
export async function listStorageObjects(prefix, options = {}) {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .list(prefix, {
        limit: options.limit || 1000,
        offset: options.offset || 0,
        search: options.search || undefined,
      });

    if (error) {
      console.error('[Storage] List error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[Storage] List exception:', err.message);
    return [];
  }
}

/**
 * Recursively list all audio objects in the Supabase Storage bucket under a directory prefix.
 * @param {string} prefix - Starting path (e.g., 'music' or '')
 * @returns {Array<{ name: string, path: string, updated_at: string, created_at: string, metadata: object }>}
 */
export async function listAllAudioObjects(prefix = 'music') {
  const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.m4a', '.ogg', '.aac']);
  const audioObjects = [];

  async function walk(dirPath) {
    const items = await listStorageObjects(dirPath);
    for (const item of items) {
      const fullPath = dirPath ? `${dirPath}/${item.name}` : item.name;

      // In Supabase Storage, directory entries have id === null or metadata === null or no mimetype
      const isDirectory = !item.id && !item.metadata;

      if (isDirectory) {
        await walk(fullPath);
      } else {
        const ext = fullPath.substring(fullPath.lastIndexOf('.')).toLowerCase();
        if (AUDIO_EXTS.has(ext)) {
          audioObjects.push({
            name: item.name,
            path: fullPath,
            updated_at: item.updated_at,
            created_at: item.created_at,
            metadata: item.metadata
          });
        }
      }
    }
  }

  await walk(prefix);
  return audioObjects;
}

// ============================================================
// Key Builders (preserve B2 key format)
// ============================================================

/**
 * Build the storage key for an audio file.
 * Same format as the old buildAudioKey from b2.js.
 */
/**
 * Supabase Storage only accepts the character set enforced by its `isValidKey`
 * validation: ASCII alphanumerics, `_`, and a small allow-list of symbols plus
 * whitespace (`! * ' ( ) space & $ @ = ; : + , ? .`). Anything outside that set —
 * non-ASCII letters such as accents (é, ñ) or symbols like `÷` — makes the whole
 * key invalid and the upload fails with `InvalidKey`.
 *
 * We normalize/transliterate where possible (é -> e) and replace the remaining
 * disallowed characters with a hyphen. Every already-accepted character
 * (including spaces, apostrophes and hyphens) is kept untouched, so keys already
 * stored in the bucket keep resolving and are never silently re-keyed. `/` is
 * excluded because it is the folder delimiter and may only appear between
 * components, never inside one.
 */
export function sanitizeStorageComponent(input) {
  if (input == null) return 'unknown';
  const normalized = String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  const kept = normalized.replace(/[^A-Za-z0-9_!.*'() &$@=;:+?,-]/g, '-');
  const collapsed = kept.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').trim();
  return collapsed.length ? collapsed : 'unknown';
}

/**
 * Sanitize the file-name portion of an audio key.
 *
 * The uploader has always replaced any character outside `[A-Za-z0-9_-]` with an
 * underscore. We preserve that exact behaviour so audio keys already in the
 * bucket (which used this scheme) keep matching.
 */
export function sanitizeStorageFileName(input) {
  if (input == null) return 'unknown';
  const sanitized = String(input).replace(/[^A-Za-z0-9_-]/g, '_');
  return sanitized.length ? sanitized : 'unknown';
}

export function buildAudioKey(artist, album, filename) {
  const str = String(filename);
  const dotIdx = str.lastIndexOf('.');
  const stem = dotIdx > 0 ? str.slice(0, dotIdx) : str;
  const ext = dotIdx > 0 ? str.slice(dotIdx) : '';
  const safeName = `${sanitizeStorageFileName(stem)}${ext}`;
  return `music/${sanitizeStorageComponent(artist)}/${sanitizeStorageComponent(album)}/${safeName}`;
}

/**
 * Build the storage key for artwork (cover art).
 * Same format as buildArtworkKey from b2.js.
 */
export function buildArtworkKey(trackId, ext) {
  return `artworks/${trackId}.${ext}`;
}

/**
 * Build the storage key for artist images.
 * Same format as buildArtistKey from b2.js.
 */
export function buildArtistKey(artistName, ext) {
  return `artists/${sanitizeStorageComponent(artistName)}.${ext}`;
}

/**
 * Build the storage key for user avatars.
 * Same format as buildAvatarKey from b2.js.
 */
export function buildAvatarKey(userId, ext) {
  return `avatars/${sanitizeStorageComponent(userId)}.${ext}`;
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Extract file extension from a MIME type.
 */
export function extFromMime(mimeType) {
  const map = {
    'audio/mpeg': 'mp3',
    'audio/flac': 'flac',
    'audio/wav': 'wav',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/ogg': 'ogg',
    'audio/aac': 'aac',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mimeType] || 'bin';
}

/**
 * Extract MIME type from a file extension.
 */
export function mimeFromExt(ext) {
  const map = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    aac: 'audio/aac',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  return map[ext?.toLowerCase()] || 'application/octet-stream';
}

/**
 * Check if a path is a local filesystem path (legacy).
 * Always returns false in the new architecture (no more B2 vs local distinction).
 */
export function isLocalPath(filePath) {
  if (!filePath) return false;
  return filePath.startsWith('/') || filePath.startsWith('\\\\');
}

/**
 * Check if cloud storage is configured.
 * Always returns true in the new architecture.
 */
export function isStorageConfigured() {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

// Backward-compatible aliases for gradual migration
export const isB2Configured = isStorageConfigured;
export const getPresignedStreamUrl = getSignedUrl;
export const deleteFromB2 = deleteFromStorage;
export const getBufferFromB2 = getBufferFromStorage;
export const listB2Objects = listStorageObjects;
