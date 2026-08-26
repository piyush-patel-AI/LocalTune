/**
 * server/b2.js
 * Shared Backblaze B2 client.
 *
 * Uploads use the B2 Native API (b2_authorize_account → b2_get_upload_url →
 * b2_upload_file with raw Buffer body). This avoids the known B2 S3-compatible
 * API "IncompleteBody" bug that affects large PUT bodies.
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
import { createHash } from 'node:crypto';
import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const { B2_ACCOUNT_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_PUBLIC_URL } = process.env;

// ── Configuration ──

/** True when all required B2 credentials are present. */
export const isB2Configured = () =>
  !!(process.env.B2_ACCOUNT_ID && process.env.B2_APPLICATION_KEY && process.env.B2_BUCKET_NAME && process.env.B2_ENDPOINT);

if (!isB2Configured()) {
  console.warn('[B2] WARNING: Missing B2 env vars — B2 storage unavailable until configured.');
}

// ── S3Client for read operations only (GET, HEAD, DELETE, presigned URLs) ──

const _b2Url = B2_ENDPOINT ? new URL(B2_ENDPOINT) : null;
const _b2Region = _b2Url?.hostname?.match(/^s3\.([^.]+)\.backblazeb2\.com$/)?.[1] || 'auto';

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

// ── B2 Native API Authorization Cache ──

const AUTH_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours (token valid 24h)

let _authCache = null; // { authToken, apiUrl, accountId, obtainedAt }
let _bucketIdCache = null; // { bucketId, obtainedAt }

// ── B2 Native API Helpers ──

/**
 * Make an HTTPS request to the B2 Native API.
 * Returns parsed JSON response.
 */
function b2NativeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let body;
        try { body = JSON.parse(raw); } catch { body = { raw }; }
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', reject);
    req.setTimeout(30_000, () => { req.destroy(new Error('B2 Native API request timeout')); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

/**
 * Authorize with B2 Native API using Basic Auth.
 * Returns { authToken, apiUrl, accountId }.
 */
async function b2Authorize() {
  const authString = Buffer.from(`${B2_ACCOUNT_ID}:${B2_APPLICATION_KEY}`).toString('base64');
  const url = 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account';

  const res = await b2NativeRequest(url, {
    headers: { 'Authorization': `Basic ${authString}` }
  });

  if (res.status !== 200) {
    throw new Error(`B2 authorize_account failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const storageApi = res.body.apiInfo?.storageApi;
  if (!storageApi) {
    throw new Error('B2 authorize_account response missing apiInfo.storageApi');
  }

  return {
    authToken: res.body.authorizationToken,
    apiUrl: storageApi.apiUrl,
    accountId: res.body.accountId
  };
}

/**
 * Resolve bucket name to bucket ID using b2_list_buckets.
 * Returns bucketId string.
 */
async function b2ResolveBucketId(authToken, apiUrl) {
  const url = `${apiUrl}/b2api/v4/b2_list_buckets`;

  const res = await b2NativeRequest(url, {
    method: 'POST',
    headers: {
      'Authorization': authToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ bucketName: B2_BUCKET_NAME })
  });

  if (res.status !== 200) {
    throw new Error(`B2 list_buckets failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const buckets = res.body.buckets || [];
  const match = buckets.find(b => b.bucketName === B2_BUCKET_NAME);
  if (!match) {
    throw new Error(`B2 bucket "${B2_BUCKET_NAME}" not found in account`);
  }

  return match.bucketId;
}

/**
 * Get a fresh upload URL and authorization token for the configured bucket.
 * Returns { uploadUrl, authorizationToken }.
 */
async function b2GetUploadUrl(authToken, apiUrl, bucketId) {
  const url = `${apiUrl}/b2api/v4/b2_get_upload_url?bucketId=${encodeURIComponent(bucketId)}`;

  const res = await b2NativeRequest(url, {
    headers: { 'Authorization': authToken }
  });

  if (res.status !== 200) {
    throw new Error(`B2 get_upload_url failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return {
    uploadUrl: res.body.uploadUrl,
    authorizationToken: res.body.authorizationToken
  };
}

/**
 * Get a fresh authorized context: authToken + apiUrl + bucketId.
 * Re-authorizes if cache is expired or missing.
 */
async function b2GetAuthorizedContext(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && _authCache && (now - _authCache.obtainedAt) < AUTH_TTL_MS && _bucketIdCache) {
    return {
      authToken: _authCache.authToken,
      apiUrl: _authCache.apiUrl,
      bucketId: _bucketIdCache.bucketId
    };
  }

  const auth = await b2Authorize();
  _authCache = { ...auth, obtainedAt: now };

  const bucketId = await b2ResolveBucketId(auth.authToken, auth.apiUrl);
  _bucketIdCache = { bucketId, obtainedAt: now };

  return { authToken: auth.authToken, apiUrl: auth.apiUrl, bucketId };
}

// ── Upload Helpers ──

/**
 * Percent-encode a value for the B2 Native API X-Bz-File-Name header.
 * Encodes everything except unreserved characters per RFC 3986.
 * Forward slashes are left unencoded (path separators).
 */
function encodeFileName(name) {
  return name.replace(/[^A-Za-z0-9\-_.~\/]/g, (ch) =>
    '%' + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')
  );
}

/**
 * Upload a raw Buffer to B2 via the Native API b2_upload_file endpoint.
 * The body is sent as-is — no encoding, no chunking, no multipart.
 *
 * @returns {Promise<{ fileId: string, fileName: string, contentLength: number, contentSha1: string }>}
 */
async function b2UploadFile(uploadUrl, uploadAuthToken, key, body, contentType) {
  const fileName = encodeFileName(key);
  const sha1 = createHash('sha1').update(body).digest('hex');

  const res = await b2NativeRequest(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': uploadAuthToken,
      'X-Bz-File-Name': fileName,
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      'X-Bz-Content-Sha1': sha1,
      'User-Agent': 'LocalTune/1.0'
    },
    body
  });

  return { status: res.status, body: res.body, sha1 };
}

/**
 * Check if a B2 error should trigger a retry with a new upload URL.
 */
function isRetryableB2Error(status, code) {
  // Per B2 documentation, retryable conditions:
  if (status === 408) return true; // Request Timeout
  if (status >= 500 && status <= 599) return true; // 5xx
  if (status === 401 && (code === 'expired_auth_token' || code === 'bad_auth_token')) return true;
  return false;
}

/**
 * Check if a B2 error should trigger full re-authorization (not just new upload URL).
 */
function needsReauth(status, code) {
  return status === 401 && (code === 'expired_auth_token' || code === 'bad_auth_token');
}

/**
 * Compute exponential backoff delay with jitter.
 * Returns delay in milliseconds.
 */
function backoffDelay(attempt, baseMs = 1000) {
  const exp = Math.min(attempt, 6); // cap at 2^6 = 64s
  const delay = baseMs * Math.pow(2, exp);
  const jitter = delay * 0.25 * Math.random();
  return Math.round(delay + jitter);
}

// ── Public Upload API ──

/**
 * Upload a Buffer to B2 via the Native API (b2_upload_file).
 *
 * Uses the documented B2 Native upload flow:
 *   1. b2_authorize_account → get API URL + auth token
 *   2. b2_list_buckets → get bucket ID from bucket name
 *   3. b2_get_upload_url → get per-pod upload URL + auth token
 *   4. POST raw Buffer to upload URL → verify response
 *
 * Retries on transient errors (network, 5xx, 408, expired auth tokens)
 * with a fresh upload URL per attempt. Max 5 attempts.
 *
 * @param {string} key         B2 object key (logical, unencoded)
 * @param {Buffer} body        data to upload
 * @param {string} contentType MIME type
 * @param {string} [cid]       optional correlation id for structured logging
 * @returns {Promise<string>}  the key on success
 */
export async function uploadToB2(key, body, contentType, cid) {
  if (!Buffer.isBuffer(body)) throw new Error('uploadToB2 only accepts Buffer bodies');
  const tag = cid ? `[B2][${cid}]` : '[B2]';
  const size = body.length;
  const sha1 = createHash('sha1').update(body).digest('hex');
  console.log(`${tag} native upload start key=${key} size=${size} sha1=${sha1.slice(0, 16)}… content_type=${contentType}`);

  const t0 = Date.now();
  const MAX_ATTEMPTS = 5;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let ctx;
    try {
      ctx = await b2GetAuthorizedContext(attempt > 1);
    } catch (authErr) {
      console.error(`${tag} authorization failed on attempt=${attempt}: ${authErr.message}`);
      throw authErr;
    }

    let uploadUrl, uploadAuthToken;
    try {
      const urlResult = await b2GetUploadUrl(ctx.authToken, ctx.apiUrl, ctx.bucketId);
      uploadUrl = urlResult.uploadUrl;
      uploadAuthToken = urlResult.authorizationToken;
    } catch (urlErr) {
      console.error(`${tag} get_upload_url failed on attempt=${attempt}: ${urlErr.message}`);
      if (attempt < MAX_ATTEMPTS) {
        _authCache = null;
        _bucketIdCache = null;
        continue;
      }
      throw urlErr;
    }

    console.log(`${tag} native POST attempt=${attempt}/${MAX_ATTEMPTS} sha1=${sha1.slice(0, 16)}… content-length=${size}`);

    let result;
    try {
      result = await b2UploadFile(uploadUrl, uploadAuthToken, key, body, contentType);
    } catch (netErr) {
      const elapsed = Date.now() - t0;
      console.error(`${tag} NETWORK ERROR attempt=${attempt} elapsed=${elapsed}ms error=${netErr.message}`);
      _authCache = null;
      _bucketIdCache = null;
      if (attempt < MAX_ATTEMPTS) continue;
      throw netErr;
    }

    const elapsed = Date.now() - t0;
    const res = result.body;

    if (result.status === 200) {
      // Verify response fields
      const returnedLength = Number(res.contentLength);
      if (returnedLength !== size) {
        const err = new Error(`B2 contentLength mismatch: expected ${size}, got ${returnedLength}`);
        console.error(`${tag} VERIFY FAILED attempt=${attempt} elapsed=${elapsed}ms ${err.message}`);
        throw err;
      }

      if (res.contentSha1 !== sha1) {
        const err = new Error(`B2 contentSha1 mismatch: expected ${sha1}, got ${res.contentSha1}`);
        console.error(`${tag} VERIFY FAILED attempt=${attempt} elapsed=${elapsed}ms ${err.message}`);
        throw err;
      }

      if (!res.fileId) {
        const err = new Error('B2 upload response missing fileId');
        console.error(`${tag} VERIFY FAILED attempt=${attempt} elapsed=${elapsed}ms ${err.message}`);
        throw err;
      }

      console.log(`${tag} native upload ok key=${key} attempt=${attempt} fileId=${res.fileId} elapsed=${elapsed}ms`);
      return key;
    }

    // Non-200: determine if retryable
    const b2Code = res.code || '';
    const b2Msg = res.message || '';

    console.error(`${tag} native upload FAILED attempt=${attempt} status=${result.status} code=${b2Code} message=${b2Msg} elapsed=${elapsed}ms`);

    if (needsReauth(result.status, b2Code)) {
      console.warn(`${tag} auth expired on attempt=${attempt}, re-authorizing on next attempt`);
      _authCache = null;
      _bucketIdCache = null;
    }

    if (isRetryableB2Error(result.status, b2Code) && attempt < MAX_ATTEMPTS) {
      const delay = backoffDelay(attempt);
      console.warn(`${tag} retryable error on attempt=${attempt}, retrying in ${delay}ms…`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    // Permanent error
    const err = new Error(`B2 upload failed: ${result.status} ${b2Code} ${b2Msg}`);
    err.b2StatusCode = result.status;
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

// ── Key builders ──

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
  return `artists/${safe(artistName)}/${ext}`;
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

// ── Exported internals for testing ──

export { b2Authorize, b2ResolveBucketId, b2GetUploadUrl, b2UploadFile, b2NativeRequest, encodeFileName };
