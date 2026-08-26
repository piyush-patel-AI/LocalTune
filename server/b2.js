/**
 * server/b2.js
 * Shared Backblaze B2 client — AWS SDK v3 S3-compatible API.
 *
 * Required env vars:
 *   B2_ACCOUNT_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT
 * Optional:
 *   B2_PUBLIC_URL  — Cloudflare CDN base URL for public objects (artworks/artists)
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const { B2_ACCOUNT_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_PUBLIC_URL } = process.env;

/** True when all required B2 credentials are present. */
export const isB2Configured = () =>
  !!(process.env.B2_ACCOUNT_ID && process.env.B2_APPLICATION_KEY && process.env.B2_BUCKET_NAME && process.env.B2_ENDPOINT);

if (!isB2Configured()) {
  console.warn('[B2] WARNING: Missing B2 env vars — B2 storage unavailable until configured.');
}

export const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: 'auto',
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  expectContinueHeader: false,
  credentials: {
    accessKeyId: B2_ACCOUNT_ID || '',
    secretAccessKey: B2_APPLICATION_KEY || ''
  }
});

// ── TEMP DIAGNOSTIC: inspect Body at the last moment before HTTP send ──
// Runs on every s3.send() including retries. Logs type + byte count only.
s3.middlewareStack.add(
  (next) => async (args) => {
    const { body: reqBody, headers } = args.request;
    const bodyType = reqBody?.constructor?.name || typeof reqBody;
    let bodyLen;
    if (Buffer.isBuffer(reqBody)) {
      bodyLen = reqBody.length;
    } else if (typeof reqBody?.read === 'function') {
      bodyLen = 'READABLE_STREAM';
    } else if (typeof reqBody?.length === 'number') {
      bodyLen = reqBody.length;
    } else {
      bodyLen = 'unknown';
    }
    console.log(`[B2-HTTP] finalize body_type=${bodyType} body_length=${bodyLen} content_length=${headers['content-length']} expect=${headers['Expect'] || headers.expect || 'none'} host=${headers['host']}`);
    return next(args);
  },
  { step: 'finalizeRequest', name: 'byteTraceInspector', priority: 'low' }
);

/**
 * Upload a Buffer or readable stream to B2. Returns the key on success.
 * @param {string} key         B2 object key
 * @param {Buffer} body        data to upload
 * @param {string} contentType MIME type
 * @param {string} [cid]       optional correlation id for structured logging
 */
export async function uploadToB2(key, body, contentType, cid) {
  const tag = cid ? `[B2][${cid}]` : '[B2]';
  const bodyType = body?.constructor?.name || typeof body;
  const isBuffer = Buffer.isBuffer(body);
  const isStream = body && typeof body.read === 'function';
  const size = isBuffer ? body.length : null;
  console.log(`${tag} upload start key=${key} size=${size} body_type=${bodyType} is_buffer=${isBuffer} is_stream=${!!isStream} content_type=${contentType}`);

  const t0 = Date.now();
  try {
    await s3.send(new PutObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType
    }));
    const elapsed = Date.now() - t0;
    console.log(`${tag} upload ok key=${key} elapsed=${elapsed}ms`);
    return key;
  } catch (err) {
    const elapsed = Date.now() - t0;
    const postBodyType = body?.constructor?.name || typeof body;
    const postSize = Buffer.isBuffer(body) ? body.length : null;
    console.error(`${tag} upload FAILED key=${key} elapsed=${elapsed}ms post_err_body_type=${postBodyType} post_err_body_length=${postSize} error=${err.message}`);
    throw err;
  }
}

/**
 * Upload + verify: uploads the object, then performs a HeadObject to confirm
 * it exists and has the expected size. Throws on verification failure.
 */
export async function uploadToB2Verified(key, body, contentType, cid) {
  const expectedSize = Buffer.isBuffer(body) ? body.length : null;
  await uploadToB2(key, body, contentType, cid);

  const tag = cid ? `[B2][${cid}]` : '[B2]';
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
    if (expectedSize != null && head.ContentLength != null && head.ContentLength !== expectedSize) {
      const msg = `verification failed: expected size ${expectedSize}, got ${head.ContentLength}`;
      console.error(`${tag} ${msg} key=${key}`);
      throw new Error(msg);
    }
    console.log(`${tag} verified ok key=${key} size=${head.ContentLength}`);
  } catch (err) {
    if (err.message && err.message.startsWith('verification failed')) throw err;
    const msg = `verification HEAD failed: ${err.message}`;
    console.error(`${tag} ${msg} key=${key}`);
    throw new Error(msg);
  }
  return key;
}

/** Delete an object from B2 by key. Safe no-op if key is falsy. */
export async function deleteFromB2(key) {
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
    console.log(`[B2] Deleted: ${key}`);
  } catch (err) {
    console.error(`[B2] Failed to delete ${key}:`, err.message);
  }
}

/**
 * Generate a time-limited presigned URL for private audio streaming.
 * B2 natively handles HTTP Range 206 seeking on presigned URLs.
 * HTML5 <audio> and Android MediaPlayer follow the 302 redirect transparently.
 *
 * @param {string}  key        B2 object key
 * @param {number}  expiresIn  seconds until expiry (default 7200 = 2 hours)
 * @returns {Promise<string>} presigned URL
 */
export async function getPresignedStreamUrl(key, expiresIn = 7200) {
  const cmd = new GetObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/**
 * Return the public CDN URL for a publicly accessible B2 object (artworks/artists).
 * Uses B2_PUBLIC_URL if configured (e.g. Cloudflare CDN); otherwise falls back to
 * the direct B2 download URL.
 *
 * @param {string} key  B2 object key
 * @returns {string|null}
 */
export function getPublicUrl(key) {
  if (!key) return null;
  const base = B2_PUBLIC_URL ? B2_PUBLIC_URL.replace(/\/$/, '') : `${B2_ENDPOINT}/${B2_BUCKET_NAME}`;
  return `${base}/${key}`;
}

/** Returns true if the key exists in B2. */
export async function existsInB2(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Download an object body into a Buffer (used by the scanner to parse
 * metadata and extract embedded artwork without touching local disk).
 */
export async function getBufferFromB2(key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: B2_BUCKET_NAME, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

/**
 * List every object under a prefix. Returns [{ key, size, lastModified }].
 * Paginates automatically (B2 caps at 1000 keys per request).
 */
export async function listB2Objects(prefix = '') {
  const items = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: B2_BUCKET_NAME,
      Prefix: prefix,
      ContinuationToken: token
    }));
    for (const obj of res.Contents || []) {
      items.push({ key: obj.Key, size: obj.Size || 0, lastModified: obj.LastModified });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return items;
}

/**
 * Resolve a stable URL for a media object:
 *  - If B2_PUBLIC_URL is set (e.g. Cloudflare CDN in front of the bucket),
 *    return that public URL (cacheable, no expiry).
 *  - Otherwise return a presigned GET URL (works with private buckets).
 */
export async function resolveMediaUrl(key, expiresIn = 86400) {
  if (!key) return null;
  if (process.env.B2_PUBLIC_URL) return getPublicUrl(key);
  return getPresignedStreamUrl(key, expiresIn);
}

// --- Key builders ---

const safe = (s) => (s || 'Unknown').replace(/[^a-zA-Z0-9 _\-.()']/g, '_').trim();

/** True when a stored value is a local filesystem path rather than a B2 key. */
export function isLocalPath(p) {
  if (!p) return false;
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

/** "music/Artist/Album/filename.mp3" */
export function buildAudioKey(artist, album, filename) {
  return `music/${safe(artist)}/${safe(album)}/${filename}`;
}

/** "artworks/123.jpg" */
export function buildArtworkKey(trackId, ext = '.jpg') {
  return `artworks/${trackId}${ext}`;
}

/** "artists/ArtistName.jpg" */
export function buildArtistKey(artistName, ext = '.jpg') {
  return `artists/${safe(artistName)}${ext}`;
}

/** "avatars/3.jpg" */
export function buildAvatarKey(userId, ext = '.jpg') {
  return `avatars/${userId}${ext}`;
}

/** Image extension from a mime type like "image/png". */
export function extFromMime(mime) {
  if (!mime) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('gif')) return '.gif';
  return '.jpg';
}

/** Mime type from an image extension like ".png". */
export function mimeFromExt(ext) {
  switch ((ext || '').toLowerCase()) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}
