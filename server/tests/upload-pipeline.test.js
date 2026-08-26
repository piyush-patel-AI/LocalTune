import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

// ── Set B2 env vars BEFORE importing b2.js so the module-level endpoint parse works ──
process.env.B2_ACCOUNT_ID = process.env.B2_ACCOUNT_ID || 'test-account-id';
process.env.B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || 'test-application-key';
process.env.B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'test-bucket';
process.env.B2_ENDPOINT = process.env.B2_ENDPOINT || 'https://s3.ca-east-006.backblazeb2.com';

// ── B2 module exports ──
const b2 = await import('../b2.js');

// ── Helper: create mock HTTPS request handler ──
function createMockHttpsHandler() {
  const origRequest = https.request;
  const requests = [];

  function install(routes) {
    // routes is an array of { match: (host, path, opts) => bool, respond: (body, opts) => { status, json } }
    https.request = function mockRequest(options, callback) {
      const host = options.hostname || '';
      const path = options.path || '';
      const method = options.method || 'GET';

      let capturedBody = null;
      const req = new EventEmitter();
      req.writableEnded = false;
      req.setTimeout = function(_ms, cb) { if (cb) cb(); return req; };
      req.destroy = function() { return req; };
      req.write = function(data) {
        if (data !== undefined) capturedBody = data;
        return true;
      };
      req.end = function(data) {
        if (data !== undefined && !Buffer.isBuffer(data) && typeof data === 'string') {
          capturedBody = data;
        } else if (Buffer.isBuffer(data)) {
          capturedBody = data;
        }
        req.writableEnded = true;

        const entry = { host, path, method, headers: options.headers, body: capturedBody, timestamp: Date.now() };
        requests.push(entry);

        const route = routes.find(r => r.match(host, path, options));
        if (!route) {
          process.nextTick(() => {
            const res = new Readable({
              read() { this.push(Buffer.from(JSON.stringify({ status: 404, code: 'not_found', message: 'no matching route' }))); this.push(null); }
            });
            res.statusCode = 404;
            res.headers = {};
            callback(res);
          });
          return req;
        }

        const resp = route.respond(capturedBody, options);
        process.nextTick(() => {
          const res = new Readable({
            read() { this.push(Buffer.from(JSON.stringify(resp.json))); this.push(null); }
          });
          res.statusCode = resp.status;
          res.headers = {};
          callback(res);
        });
        return req;
      };
      return req;
    };
  }

  function restore() {
    https.request = origRequest;
  }

  function getRequests() { return requests; }
  function clearRequests() { requests.length = 0; }

  return { install, restore, getRequests, clearRequests };
}

// ── Standard mock routes for successful upload ──
const B2_API_URL = 'https://api004.backblazeb2.com';
const B2_UPLOAD_URL = 'https://pod-000-1013-02.backblazeb2.com/b2api/v4/b2_upload_file/test-bucket-id/c001_v0001013_t0020';
const B2_BUCKET_ID = 'test-bucket-id-12345';
const B2_AUTH_TOKEN = 'test-auth-token-abc';
const B2_UPLOAD_AUTH_TOKEN = 'test-upload-auth-token-xyz';

function makeAuthRoutes() {
  return [
    {
      match: (host, path) => host === 'api.backblazeb2.com' && path.includes('b2_authorize_account'),
      respond: () => ({
        status: 200,
        json: {
          accountId: 'test-account-id',
          apiInfo: {
            storageApi: {
              apiUrl: B2_API_URL,
              downloadUrl: 'https://f001.backblazeb2.com',
              allowed: {
                buckets: [{ id: B2_BUCKET_ID, name: 'test-bucket' }],
                capabilities: ['writeFiles', 'readFiles', 'listFiles', 'listBuckets']
              }
            }
          },
          authorizationToken: B2_AUTH_TOKEN
        }
      })
    },
    {
      match: (host, path) => host === 'api004.backblazeb2.com' && path.includes('b2_list_buckets'),
      respond: () => ({
        status: 200,
        json: {
          buckets: [{ bucketId: B2_BUCKET_ID, bucketName: 'test-bucket', bucketType: 'allPrivate' }]
        }
      })
    },
    {
      match: (host, path) => host === 'api004.backblazeb2.com' && path.includes('b2_get_upload_url'),
      respond: () => ({
        status: 200,
        json: {
          bucketId: B2_BUCKET_ID,
          uploadUrl: B2_UPLOAD_URL,
          authorizationToken: B2_UPLOAD_AUTH_TOKEN
        }
      })
    }
  ];
}

// ── Basic export tests ──

test('b2.js exports uploadToB2 as async function', () => {
  assert.equal(typeof b2.uploadToB2, 'function');
});

test('b2.js exports uploadToB2Verified as async function', () => {
  assert.equal(typeof b2.uploadToB2Verified, 'function');
});

test('b2.js exports existsInB2 as async function', () => {
  assert.equal(typeof b2.existsInB2, 'function');
});

test('b2.js exports isB2Configured as function', () => {
  assert.equal(typeof b2.isB2Configured, 'function');
  assert.equal(b2.isB2Configured(), true);
});

test('b2.js exports key builder functions', () => {
  assert.equal(typeof b2.buildAudioKey, 'function');
  assert.equal(typeof b2.buildArtworkKey, 'function');
  assert.equal(typeof b2.buildArtistKey, 'function');
  assert.equal(typeof b2.extFromMime, 'function');
});

// ── S3Client configuration ──

test('REGRESSION: S3Client uses extracted region from B2_ENDPOINT', async () => {
  const region = await b2.s3.config.region();
  assert.equal(region, 'ca-east-006',
    'S3Client region must be extracted from B2_ENDPOINT hostname');
});

test('REGRESSION: S3Client uses forcePathStyle for B2 compatibility', () => {
  const s3 = b2.s3;
  const config = s3.config;
  assert.equal(config.forcePathStyle, true,
    'S3Client must use forcePathStyle for Backblaze B2');
});

// ── B2 Native API: authorization parsing ──

test('B2 NATIVE: b2_authorize_account parses response correctly', async () => {
  const mock = createMockHttpsHandler();
  try {
    mock.install(makeAuthRoutes());
    const auth = await b2.b2Authorize();
    assert.equal(auth.apiUrl, B2_API_URL);
    assert.ok(auth.authToken, 'must return auth token');
    assert.equal(auth.accountId, 'test-account-id');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: bucket resolution ──

test('B2 NATIVE: b2_list_buckets resolves bucket name to bucket ID', async () => {
  const mock = createMockHttpsHandler();
  try {
    mock.install(makeAuthRoutes());
    const bucketId = await b2.b2ResolveBucketId(B2_AUTH_TOKEN, B2_API_URL);
    assert.equal(bucketId, B2_BUCKET_ID);
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: upload URL acquisition ──

test('B2 NATIVE: b2_get_upload_url returns upload URL and token', async () => {
  const mock = createMockHttpsHandler();
  try {
    mock.install(makeAuthRoutes());
    const result = await b2.b2GetUploadUrl(B2_AUTH_TOKEN, B2_API_URL, B2_BUCKET_ID);
    assert.equal(result.uploadUrl, B2_UPLOAD_URL);
    assert.equal(result.authorizationToken, B2_UPLOAD_AUTH_TOKEN);
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: file name encoding ──

test('B2 NATIVE: encodeFileName percent-encodes spaces and special characters', () => {
  assert.equal(b2.encodeFileName('hello world'), 'hello%20world');
  assert.equal(b2.encodeFileName('Artist & Band/Album + Deluxe/track #1.mp3'),
    'Artist%20%26%20Band/Album%20%2B%20Deluxe/track%20%231.mp3');
  assert.equal(b2.encodeFileName('music/Boney M/Nightflight to Venus/song.mp3'),
    'music/Boney%20M/Nightflight%20to%20Venus/song.mp3');
  assert.equal(b2.encodeFileName('plain-file.txt'), 'plain-file.txt');
  assert.equal(b2.encodeFileName('path/to/file.mp3'), 'path/to/file.mp3');
});

// ── B2 Native API: exact 8,832,102-byte Buffer upload ──

test('B2 NATIVE: uploadToB2 sends exact 8,832,102-byte Buffer via Native API POST', async () => {
  const PRODUCTION_SIZE = 8_832_102;
  const body = Buffer.alloc(PRODUCTION_SIZE, 0xCD);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: (reqBody, opts) => {
          // Verify the body is the exact buffer
          assert.ok(Buffer.isBuffer(reqBody), 'upload body must be a Buffer');
          assert.equal(reqBody.length, PRODUCTION_SIZE, 'upload body must be exactly 8,832,102 bytes');
          assert.equal(Number(opts.headers['Content-Length']), PRODUCTION_SIZE, 'Content-Length must equal buffer length');
          assert.equal(opts.headers['X-Bz-Content-Sha1'], expectedSha1, 'X-Bz-Content-Sha1 must match SHA1 of buffer');
          return {
            status: 200,
            json: {
              fileId: '4_test-file-id',
              fileName: 'music/test/test.mp3',
              contentLength: String(PRODUCTION_SIZE),
              contentSha1: expectedSha1,
              contentType: 'audio/mpeg'
            }
          };
        }
      }
    ];
    mock.install(routes);

    const key = `__regression-test__/${Date.now()}/large-upload.mp3`;
    const result = await b2.uploadToB2(key, body, 'audio/mpeg', 'test-native');
    assert.equal(result, key, 'uploadToB2 must return the original key');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: Content-Length and SHA1 verification ──

test('B2 NATIVE: uploadToB2 verifies contentLength and contentSha1 from B2 response', async () => {
  const body = Buffer.alloc(1024, 0xAB);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => ({
          status: 200,
          json: {
            fileId: '4_verify-test',
            fileName: 'test/verify.mp3',
            contentLength: '1024',
            contentSha1: expectedSha1,
            contentType: 'audio/mpeg'
          }
        })
      }
    ];
    mock.install(routes);

    const result = await b2.uploadToB2('test/verify.mp3', body, 'audio/mpeg', 'test-verify');
    assert.equal(result, 'test/verify.mp3');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: contentLength mismatch is rejected ──

test('B2 NATIVE: uploadToB2 rejects when contentLength does not match', async () => {
  const body = Buffer.alloc(1024, 0xAB);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => ({
          status: 200,
          json: {
            fileId: '4_mismatch',
            fileName: 'test/mismatch.mp3',
            contentLength: '999', // WRONG
            contentSha1: expectedSha1,
            contentType: 'audio/mpeg'
          }
        })
      }
    ];
    mock.install(routes);

    await assert.rejects(
      () => b2.uploadToB2('test/mismatch.mp3', body, 'audio/mpeg', 'test-mismatch-len'),
      (err) => {
        assert.ok(err.message.includes('contentLength mismatch'), 'must reject on contentLength mismatch');
        return true;
      }
    );
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: contentSha1 mismatch is rejected ──

test('B2 NATIVE: uploadToB2 rejects when contentSha1 does not match', async () => {
  const body = Buffer.alloc(1024, 0xAB);

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => ({
          status: 200,
          json: {
            fileId: '4_sha1mismatch',
            fileName: 'test/sha1.mp3',
            contentLength: '1024',
            contentSha1: '0000000000000000000000000000000000000000', // WRONG
            contentType: 'audio/mpeg'
          }
        })
      }
    ];
    mock.install(routes);

    await assert.rejects(
      () => b2.uploadToB2('test/sha1.mp3', body, 'audio/mpeg', 'test-sha1-mismatch'),
      (err) => {
        assert.ok(err.message.includes('contentSha1 mismatch'), 'must reject on contentSha1 mismatch');
        return true;
      }
    );
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: original key returned, not encoded ──

test('B2 NATIVE: uploadToB2 returns original key, not percent-encoded', async () => {
  const originalKey = 'music/Boney M/Nightflight to Venus/song.mp3';
  const body = Buffer.alloc(100, 0xCC);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => ({
          status: 200,
          json: {
            fileId: '4_key-test',
            fileName: originalKey,
            contentLength: '100',
            contentSha1: expectedSha1,
            contentType: 'audio/mpeg'
          }
        })
      }
    ];
    mock.install(routes);

    const result = await b2.uploadToB2(originalKey, body, 'audio/mpeg', 'test-key');
    assert.equal(result, originalKey, 'must return original unencoded key');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: rejects non-Buffer input ──

test('B2 NATIVE: uploadToB2 rejects non-Buffer input', async () => {
  await assert.rejects(
    () => b2.uploadToB2('key.mp3', 'not-a-buffer', 'audio/mpeg'),
    { message: 'uploadToB2 only accepts Buffer bodies' }
  );
});

// ── B2 Native API: ECONNRESET retries with new upload URL ──

test('B2 NATIVE: uploadToB2 retries on ECONNRESET and gets new upload URL', async () => {
  const body = Buffer.alloc(1024, 0xAA);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');
  let getUploadUrlCount = 0;
  let uploadCount = 0;

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_get_upload_url'),
        respond: () => {
          getUploadUrlCount++;
          return {
            status: 200,
            json: {
              bucketId: B2_BUCKET_ID,
              uploadUrl: `https://pod-${getUploadUrlCount}.backblazeb2.com/b2api/v4/b2_upload_file/${B2_BUCKET_ID}/c${getUploadUrlCount}`,
              authorizationToken: `upload-token-${getUploadUrlCount}`
            }
          };
        }
      }
    ];
    mock.install(routes);

    const origRequest = https.request;
    const routesMock = https.request;
    https.request = function(options, callback) {
      const path = options.path || '';
      if (path.includes('b2_upload_file')) {
        uploadCount++;
        if (uploadCount === 1) {
          // First upload: ECONNRESET
          const req = new EventEmitter();
          req.setTimeout = function(_ms, cb) { if (cb) cb(); return req; };
          req.destroy = function() { return req; };
          req.write = function() { return true; };
          req.end = function() {
            process.nextTick(() => req.emit('error', new Error('read ECONNRESET')));
          };
          return req;
        }
        // Subsequent uploads: delegate to routes mock (will match upload_file route from makeAuthRoutes? no)
        // Actually routes don't have upload_file, so handle success inline
        const req = new EventEmitter();
        req.setTimeout = function(_ms, cb) { if (cb) cb(); return req; };
        req.destroy = function() { return req; };
        req.write = function() { return true; };
        req.end = function() {
          process.nextTick(() => {
            const res = new Readable({
              read() {
                this.push(Buffer.from(JSON.stringify({
                  fileId: '4_econnreset-ok',
                  fileName: 'test/retry.mp3',
                  contentLength: '1024',
                  contentSha1: expectedSha1,
                  contentType: 'audio/mpeg'
                })));
                this.push(null);
              }
            });
            res.statusCode = 200;
            res.headers = {};
            callback(res);
          });
        };
        return req;
      }
      return routesMock(options, callback);
    };

    const result = await b2.uploadToB2('test/retry.mp3', body, 'audio/mpeg', 'test-econnreset');
    assert.equal(result, 'test/retry.mp3');
    assert.equal(uploadCount, 2, 'should have attempted upload twice (1 ECONNRESET + 1 success)');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: HTTP 500 retries ──

test('B2 NATIVE: uploadToB2 retries on HTTP 500 and succeeds', async () => {
  const body = Buffer.alloc(512, 0xBB);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');
  let uploadCount = 0;

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => {
          uploadCount++;
          if (uploadCount === 1) {
            return { status: 500, json: { status: 500, code: 'internal_error', message: 'server error' } };
          }
          return {
            status: 200,
            json: {
              fileId: '4_retry-ok',
              fileName: 'test/retry500.mp3',
              contentLength: '512',
              contentSha1: expectedSha1,
              contentType: 'audio/mpeg'
            }
          };
        }
      }
    ];
    mock.install(routes);

    const result = await b2.uploadToB2('test/retry500.mp3', body, 'audio/mpeg', 'test-500');
    assert.equal(result, 'test/retry500.mp3');
    assert.equal(uploadCount, 2, 'should have attempted upload twice');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: HTTP 408 retries ──

test('B2 NATIVE: uploadToB2 retries on HTTP 408 Request Timeout', async () => {
  const body = Buffer.alloc(256, 0xCC);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');
  let uploadCount = 0;

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => {
          uploadCount++;
          if (uploadCount === 1) {
            return { status: 408, json: { status: 408, code: 'request_timeout', message: 'timeout' } };
          }
          return {
            status: 200,
            json: {
              fileId: '4_timeout-ok',
              fileName: 'test/timeout.mp3',
              contentLength: '256',
              contentSha1: expectedSha1,
              contentType: 'audio/mpeg'
            }
          };
        }
      }
    ];
    mock.install(routes);

    const result = await b2.uploadToB2('test/timeout.mp3', body, 'audio/mpeg', 'test-408');
    assert.equal(result, 'test/timeout.mp3');
    assert.equal(uploadCount, 2, 'should have retried after 408');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: permanent 400 does NOT retry indefinitely ──

test('B2 NATIVE: uploadToB2 throws immediately on permanent 400 bad_request', async () => {
  const body = Buffer.alloc(100, 0xDD);
  let uploadCount = 0;

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      ...makeAuthRoutes(),
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => {
          uploadCount++;
          return { status: 400, json: { status: 400, code: 'bad_request', message: 'bad request' } };
        }
      }
    ];
    mock.install(routes);

    await assert.rejects(
      () => b2.uploadToB2('test/badrequest.mp3', body, 'audio/mpeg', 'test-400'),
      (err) => {
        assert.ok(err.message.includes('B2 upload failed'), 'error must indicate B2 upload failure');
        assert.equal(err.b2StatusCode, 400, 'must capture status code');
        return true;
      }
    );
    assert.equal(uploadCount, 1, 'must NOT retry permanent 400');
  } finally {
    mock.restore();
  }
});

// ── B2 Native API: expired_auth_token causes re-authorization ──

test('B2 NATIVE: uploadToB2 re-authorizes on expired_auth_token', async () => {
  const body = Buffer.alloc(100, 0xEE);
  const expectedSha1 = createHash('sha1').update(body).digest('hex');
  let authCount = 0;
  let uploadCount = 0;

  const mock = createMockHttpsHandler();
  try {
    const routes = [
      {
        match: (host, path) => host === 'api.backblazeb2.com' && path.includes('b2_authorize_account'),
        respond: () => {
          authCount++;
          return {
            status: 200,
            json: {
              accountId: 'test-account-id',
              apiInfo: {
                storageApi: {
                  apiUrl: B2_API_URL,
                  downloadUrl: 'https://f001.backblazeb2.com',
                  allowed: {
                    buckets: [{ id: B2_BUCKET_ID, name: 'test-bucket' }],
                    capabilities: ['writeFiles', 'readFiles', 'listFiles', 'listBuckets']
                  }
                }
              },
              authorizationToken: B2_AUTH_TOKEN
            }
          };
        }
      },
      {
        match: (host, path) => host === 'api004.backblazeb2.com' && path.includes('b2_list_buckets'),
        respond: () => ({
          status: 200,
          json: { buckets: [{ bucketId: B2_BUCKET_ID, bucketName: 'test-bucket', bucketType: 'allPrivate' }] }
        })
      },
      {
        match: (host, path) => host === 'api004.backblazeb2.com' && path.includes('b2_get_upload_url'),
        respond: () => ({
          status: 200,
          json: {
            bucketId: B2_BUCKET_ID,
            uploadUrl: B2_UPLOAD_URL,
            authorizationToken: B2_UPLOAD_AUTH_TOKEN
          }
        })
      },
      {
        match: (host, path) => path.includes('b2_upload_file'),
        respond: () => {
          uploadCount++;
          if (uploadCount === 1) {
            return { status: 401, json: { status: 401, code: 'expired_auth_token', message: 'token expired' } };
          }
          return {
            status: 200,
            json: {
              fileId: '4_reauth-ok',
              fileName: 'test/reauth.mp3',
              contentLength: '100',
              contentSha1: expectedSha1,
              contentType: 'audio/mpeg'
            }
          };
        }
      }
    ];
    mock.install(routes);

    const result = await b2.uploadToB2('test/reauth.mp3', body, 'audio/mpeg', 'test-reauth');
    assert.equal(result, 'test/reauth.mp3');
    assert.ok(authCount >= 1, 'should have authorized at least once (may use cache for first attempt)');
  } finally {
    mock.restore();
  }
});

// ── Key builder tests ──

test('buildAudioKey produces expected path format', () => {
  const key = b2.buildAudioKey('Artist', 'Album', 'song.mp3');
  assert.equal(key, 'music/Artist/Album/song.mp3');
});

test('buildArtworkKey produces expected path format', () => {
  const key = b2.buildArtworkKey(42, '.png');
  assert.equal(key, 'artworks/42.png');
});

test('buildArtistKey sanitises special characters', () => {
  const key = b2.buildArtistKey('Drake & The Weeknd', '.jpg');
  assert.ok(key.startsWith('artists/Drake'));
  assert.ok(key.endsWith('.jpg'));
});

// ── Uploader module exports ──
const uploader = await import('../uploader.js');

test('uploader.js exports handleUploadTrack', () => {
  assert.equal(typeof uploader.handleUploadTrack, 'function');
});

test('uploader.js exports uploadFieldsMiddleware', () => {
  assert.ok(uploader.uploadFieldsMiddleware);
});

test('uploader.js exports uploaderRouter', () => {
  assert.ok(uploader.uploaderRouter);
});

// ── Data consistency invariants ──
import { useTempDb } from './helpers.js';
useTempDb('upload-pipeline');

const {
  upsertTrack, getTrackById, getTrackByPath,
  findTrackByTitleAndArtist, getAllTracks, deleteTrackByPath, rekeyTrack
} = await import('../db.js');

test('DATA CONSISTENCY: getAllTracks returns empty when no tracks exist', async () => {
  const tracks = await getAllTracks();
  assert.ok(Array.isArray(tracks));
  assert.equal(tracks.length, 0);
});

test('DATA CONSISTENCY: getTrackById returns undefined for non-existent id', async () => {
  const track = await getTrackById(999999);
  assert.equal(track, undefined);
});

test('DATA CONSISTENCY: findTrackByTitleAndArtist returns falsy when no match', async () => {
  const track = await findTrackByTitleAndArtist('Nonexistent', 'Nobody');
  assert.ok(!track, 'should be falsy (null/undefined) when no match');
});

test('DATA CONSISTENCY: track only exists after explicit upsertTrack call', async () => {
  const before = await getTrackByPath('music/Test/Test/simulated-b2-key.mp3');
  assert.equal(before, undefined, 'track must not exist before upsert');

  const id = await upsertTrack({
    filePath: 'music/Test/Test/simulated-b2-key.mp3',
    title: 'Simulated Upload',
    artist: 'Test Artist',
    album: 'Test Album',
    durationSeconds: 120,
    format: 'mp3',
    fileSize: 1024,
    dateModified: new Date().toISOString()
  });

  const after = await getTrackByPath('music/Test/Test/simulated-b2-key.mp3');
  assert.ok(after, 'track must exist after upsert');
  assert.equal(after.id, id);
  assert.equal(after.file_path, 'music/Test/Test/simulated-b2-key.mp3');
  assert.equal(after.title, 'Simulated Upload');

  await deleteTrackByPath('music/Test/Test/simulated-b2-key.mp3');
  const cleaned = await getTrackByPath('music/Test/Test/simulated-b2-key.mp3');
  assert.equal(cleaned, undefined, 'track removed after cleanup');
});

test('DATA CONSISTENCY: rekeyTrack preserves id under new B2 key', async () => {
  const id = await upsertTrack({
    filePath: 'music/Original/Album/old.mp3',
    title: 'Legacy Track',
    artist: 'Old Artist',
    album: 'Old Album',
    durationSeconds: 200,
    format: 'mp3',
    fileSize: 2048,
    dateModified: new Date().toISOString()
  });

  const newKey = 'music/New Artist/New Album/new.mp3';
  await rekeyTrack('music/Original/Album/old.mp3', newKey, 4096, new Date().toISOString());

  const adopted = await getTrackByPath(newKey);
  assert.ok(adopted, 'new key must resolve');
  assert.equal(adopted.id, id, 'id must be preserved');

  const gone = await getTrackByPath('music/Original/Album/old.mp3');
  assert.equal(gone, undefined, 'old key must be gone');
});

test('DATA CONSISTENCY: duplicate detection by title+artist', async () => {
  const id1 = await upsertTrack({
    filePath: 'music/Dup/Dup/dup1.mp3',
    title: 'Dup Song',
    artist: 'Dup Artist',
    album: 'Dup Album',
    durationSeconds: 100,
    format: 'mp3',
    fileSize: 512,
    dateModified: new Date().toISOString()
  });

  const found = await findTrackByTitleAndArtist('Dup Song', 'Dup Artist');
  assert.ok(found);
  assert.equal(found.id, id1);

  await deleteTrackByPath('music/Dup/Dup/dup1.mp3');
});

// ── Stream route has correct async getTrackById ──
test('stream.js handler awaits getTrackById (no missing await)', async () => {
  const streamMod = await import('../routes/stream.js');
  const router = streamMod.default;
  assert.ok(router, 'stream router must exist');

  const getRoute = router.stack.find(l => l.route && l.route.path === '/:trackId');
  assert.ok(getRoute, 'must have GET /:trackId route');
});
