/**
 * server/b2.js
 * Shared Backblaze B2 client.
 *
 * Uploads use native HTTPS PUT with manual SigV4 signing and SHA256-hashed
 * payload — the official SDK's body handling is incompatible with B2 on
 * large PUT bodies (~8.8 MB).
 *
 * All read operations (GET, HEAD, DELETE, presigned URLs) use the official
 * AWS SDK v3 S3Client which works correctly.
 *
 * Required env vars:
 *   B2_ACCOUNT_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT
 * Optional:
 *   B2_PUBLIC_URL  — Cloudflare CDN base URL for public objects (artworks/artists)
 */

import https from 'node:https';
import { createHash, createHmac } from 'node:crypto';
import {
  S3Client,
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

// ── Pre-parse the B2 endpoint once at module load ──
const _b2Url = B2_ENDPOINT ? new URL(B2_ENDPOINT) : null;

// Derive signing region from B2 endpoint hostname.
// B2 endpoint format: s3.<region>.backblazeb2.com  →  region = <region>
// Fallback to 'auto' if parsing fails.
const _b2Region = _b2Url?.hostname?.match(/^s3\.([^.]+)\.backblazeb2\.com$/)?.[1] || 'auto';
const _b2Hostname = _b2Url?.hostname || 's3.backblazeb2.com';
const _b2Port = _b2Url?.port ? Number(_b2Url.port) : 443;

// ── S3Client for read operations only (GET, HEAD, DELETE, presigned URLs) ──
export const s3 = new S3Client({
  endpoint: B2_ENDPOINT,
  region: _b2Region,
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  expectContinueHeader: false,
  credentials: {
    accessKeyId: B2_ACCOUNT_ID || '',
    secretAccessKey: B2_APPLICATION_KEY || ''
  }
});

// ── SigV4 helpers for native HTTPS PUT ──

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

/**
 * Percent-encode a single path segment (preserves '/').
 * AWS SigV4 getCanonicalPath encodes every character except: A-Z a-z 0-9 - _ . ~ /
 */
function encodePathSegment(seg) {
  return seg.replace(/[^A-Za-z0-9\-_.~\/]/g, (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

/**
 * Upload a Buffer to B2 via native HTTPS PUT with SigV4 signing.
 *
 * Uses the actual SHA256 hash of the body (not UNSIGNED-PAYLOAD) because
 * B2 rejects UNSIGNED-PAYLOAD on PUT. The body is written as a single
 * contiguous Buffer — no chunking, no streaming — which bypasses the
 * SDK body-handling bugs that cause "request body was too small" on ~8.8 MB.
 *
 * @param {string} key         B2 object key
 * @param {Buffer} body        data to upload
 * @param {string} contentType MIME type
 * @param {string} [cid]       optional correlation id for structured logging
 * @returns {Promise<string>}  the key on success
 */
export async function uploadToB2(key, body, contentType, cid) {
  if (!Buffer.isBuffer(body)) throw new Error('uploadToB2 only accepts Buffer bodies');
  const tag = cid ? `[B2][${cid}]` : '[B2]';
  const size = body.length;
  const bodyHash = sha256Hex(body);
  console.log(`${tag} upload start key=${key} size=${size} sha256=${bodyHash.slice(0, 16)}… content_type=${contentType}`);

  const t0 = Date.now();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  // ── Step 1: Canonical Request ──
  const canonicalUri = '/' + B2_BUCKET_NAME + '/' + encodePathSegment(key);
  const canonicalQueryString = '';
  const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    `content-length:${size}\n` +
    `content-type:${contentType}\n` +
    `host:${_b2Hostname}\n` +
    `x-amz-content-sha256:${bodyHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    bodyHash
  ].join('\n');

  // ── Step 2: String to Sign ──
  const credentialScope = `${dateStamp}/${_b2Region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join('\n');

  // ── Step 3: Signing Key ──
  const kDate = hmac('AWS4' + B2_APPLICATION_KEY, dateStamp);
  const kRegion = hmac(kDate, _b2Region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');

  // ── Step 4: Signature ──
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${B2_ACCOUNT_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const wirePath = '/' + B2_BUCKET_NAME + '/' + encodePathSegment(key);

  const headers = {
    'Host': _b2Hostname,
    'Content-Type': contentType,
    'Content-Length': size,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
    'Authorization': authorization
  };

  console.log(`${tag} PUT ${_b2Hostname}:${_b2Port}${wirePath}  content-length=${size}  x-amz-content-sha256=${bodyHash.slice(0, 16)}…`);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: _b2Hostname,
      port: _b2Port,
      path: wirePath,
      method: 'PUT',
      headers
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const elapsed = Date.now() - t0;
        const bodyStr = Buffer.concat(chunks).toString('utf8');

        if (res.statusCode >= 200 && res.statusCode < 300) {
          const etagMatch = bodyStr.match(/<ETag>"([^"]+)"<\/ETag>/);
          const etag = etagMatch ? etagMatch[1] : 'unknown';
          console.log(`${tag} upload ok key=${key} status=${res.statusCode} etag=${etag} elapsed=${elapsed}ms`);
          return resolve(key);
        }

        console.error(`${tag} upload FAILED key=${key} status=${res.statusCode} elapsed=${elapsed}ms body_length=${size}`);
        console.error(`${tag} B2 response: ${bodyStr.slice(0, 500)}`);

        const codeMatch = bodyStr.match(/<Code>([^<]+)<\/Code>/);
        const msgMatch = bodyStr.match(/<Message>([^<]+)<\/Message>/);
        const err = new Error(`B2 PUT failed: ${res.statusCode} ${codeMatch ? codeMatch[1] : ''} ${msgMatch ? msgMatch[1] : bodyStr.slice(0, 200)}`);
        err.b2StatusCode = res.statusCode;
        reject(err);
      });
    });

    req.on('error', (err) => {
      const elapsed = Date.now() - t0;
      console.error(`${tag} upload NETWORK ERROR key=${key} elapsed=${elapsed}ms error=${err.message}`);
      reject(err);
    });

    req.end(body);
  });
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
