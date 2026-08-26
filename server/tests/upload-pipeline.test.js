import { test } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

// ── Set B2 env vars BEFORE importing b2.js so the module-level endpoint parse works ──
process.env.B2_ACCOUNT_ID = process.env.B2_ACCOUNT_ID || 'test-account-id';
process.env.B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || 'test-application-key';
process.env.B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'test-bucket';
process.env.B2_ENDPOINT = process.env.B2_ENDPOINT || 'https://s3.ca-east-006.backblazeb2.com';

// ── B2 module exports ──
const b2 = await import('../b2.js');

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

// ── S3Client configuration (used for reads/presigned only) ──

test('REGRESSION: S3Client uses extracted region from B2_ENDPOINT', async () => {
  const region = await b2.s3.config.region();
  assert.equal(region, 'ca-east-006',
    'S3Client region must be extracted from B2_ENDPOINT hostname, not auto');
});

test('REGRESSION: S3Client uses forcePathStyle for B2 compatibility', () => {
  const s3 = b2.s3;
  const config = s3.config;
  assert.equal(config.forcePathStyle, true,
    'S3Client must use forcePathStyle for Backblaze B2');
});

// ── 8.8 MB native HTTPS PUT: verify full Buffer on wire ──

test('REGRESSION: uploadToB2 sends full 8,832,102-byte Buffer via native HTTPS PUT', async () => {
  const PRODUCTION_SIZE = 8_832_102;
  const body = Buffer.alloc(PRODUCTION_SIZE, 0xCD);
  assert.equal(Buffer.byteLength(body), PRODUCTION_SIZE, 'Buffer must be exactly 8,832,102 bytes');

  let capturedOptions = null;
  let capturedBody = null;
  let bodyFullyWritten = false;

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    capturedOptions = options;
    const req = new EventEmitter();
    req.writableEnded = false;
    req.write = function(data) {
      if (Buffer.isBuffer(data)) capturedBody = data;
      return true;
    };
    req.end = function(data) {
      if (data !== undefined && Buffer.isBuffer(data)) capturedBody = data;
      bodyFullyWritten = true;
      req.writableEnded = true;
      process.nextTick(() => {
        const res = new Readable({
          read() {
            this.push(Buffer.from('<PutObjectResult><ETag>"abc123"</ETag></PutObjectResult>'));
            this.push(null);
          }
        });
        res.statusCode = 200;
        res.headers = { 'x-amz-request-id': 'test-regression-001' };
        callback(res);
      });
      return req;
    };
    return req;
  };

  try {
    const key = `__regression-test__/${Date.now()}/large-upload.mp3`;
    const result = await b2.uploadToB2(key, body, 'audio/mpeg', 'test-regression');

    assert.equal(result, key, 'uploadToB2 must return the key on success');
    assert.ok(capturedOptions, 'https.request must have been called');
    assert.ok(bodyFullyWritten, 'request.end() must have been called');
    assert.ok(capturedBody, 'the full body must have been written');
    assert.equal(capturedBody.length, PRODUCTION_SIZE, 'written body must be exactly 8,832,102 bytes');
    assert.equal(capturedOptions.method, 'PUT', 'must be a PUT request');
    assert.equal(capturedOptions.headers['Content-Length'], PRODUCTION_SIZE, 'Content-Length must equal body length');
    assert.ok(!capturedOptions.headers['x-amz-content-sha256'].includes('UNSIGNED'),
      'must use actual SHA256 hash, not UNSIGNED-PAYLOAD');
    assert.ok(capturedOptions.headers['Authorization'], 'request must be SigV4-signed');
    assert.ok(capturedOptions.headers['x-amz-date'], 'request must have x-amz-date header');
  } finally {
    https.request = origRequest;
  }
});

// ── x-amz-date format: must be YYYYMMDDTHHMMSSZ, no milliseconds ──

test('REGRESSION: x-amz-date is SigV4-compliant YYYYMMDDTHHMMSSZ (no milliseconds)', async () => {
  const body = Buffer.alloc(100, 0x00);
  let capturedDateHeader = null;

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    capturedDateHeader = options.headers?.['x-amz-date'];
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const res = new Readable({
          read() { this.push(Buffer.from('<PutObjectResult><ETag>"d"</ETag></PutObjectResult>')); this.push(null); }
        });
        res.statusCode = 200;
        res.headers = {};
        callback(res);
      });
      return req;
    };
    return req;
  };

  try {
    await b2.uploadToB2('date-test/test.mp3', body, 'audio/mpeg', 'test-date');
    assert.ok(capturedDateHeader, 'must have x-amz-date header');
    // SigV4 format: YYYYMMDDTHHMMSSZ — exactly 16 chars, no milliseconds
    assert.match(capturedDateHeader, /^\d{8}T\d{6}Z$/,
      'x-amz-date must be exactly YYYYMMDDTHHMMSSZ (16 chars, no milliseconds)');
    assert.equal(capturedDateHeader.length, 16,
      'x-amz-date must be exactly 16 characters');
    assert.ok(!capturedDateHeader.includes('.'), 'x-amz-date must not contain a dot (milliseconds)');
  } finally {
    https.request = origRequest;
  }
});

// ── Production key with spaces ──

test('REGRESSION: uploadToB2 preserves exact production key with spaces', async () => {
  const PRODUCTION_KEY = 'music/Boney M/Nightflight to Venus/Boney_M_-_Rasputin__Lyrics__-_7clouds.mp3';
  const body = Buffer.alloc(1024, 0xAA);
  let capturedWirePath = null;
  let capturedAuthHeader = null;

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    capturedWirePath = options.path;
    capturedAuthHeader = options.headers?.Authorization;
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const res = new Readable({
          read() { this.push(Buffer.from('<PutObjectResult><ETag>"e"</ETag></PutObjectResult>')); this.push(null); }
        });
        res.statusCode = 200;
        res.headers = { 'x-amz-request-id': 'test-space-001' };
        callback(res);
      });
      return req;
    };
    return req;
  };

  try {
    const result = await b2.uploadToB2(PRODUCTION_KEY, body, 'audio/mpeg', 'test-space');
    assert.equal(result, PRODUCTION_KEY, 'must return original unencoded key');

    // Wire path: must be percent-encoded, no raw spaces
    assert.ok(capturedWirePath, 'must capture wire path');
    assert.ok(!capturedWirePath.includes(' '), 'wire path must contain no raw spaces');
    assert.ok(capturedWirePath.includes('/Boney%20M/'), 'wire must encode "Boney M"');
    assert.ok(capturedWirePath.includes('/Nightflight%20to%20Venus/'), 'wire must encode "Nightflight to Venus"');

    // Signature must be present
    assert.ok(capturedAuthHeader, 'must have SigV4 authorization header');
    assert.ok(capturedAuthHeader.startsWith('AWS4-HMAC-SHA256'), 'must be SigV4 signature');
  } finally {
    https.request = origRequest;
  }
});

// ── Special characters in key ──

test('REGRESSION: uploadToB2 handles keys with &, +, # characters', async () => {
  const SPECIAL_KEY = 'music/Artist & Band/Album + Deluxe/track #1.mp3';
  const body = Buffer.alloc(512, 0xBB);
  let capturedWirePath = null;

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    capturedWirePath = options.path;
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const res = new Readable({
          read() { this.push(Buffer.from('<PutObjectResult><ETag>"s"</ETag></PutObjectResult>')); this.push(null); }
        });
        res.statusCode = 200;
        res.headers = { 'x-amz-request-id': 'test-special-001' };
        callback(res);
      });
      return req;
    };
    return req;
  };

  try {
    const result = await b2.uploadToB2(SPECIAL_KEY, body, 'audio/mpeg', 'test-special');
    assert.equal(result, SPECIAL_KEY, 'must return original key');
    assert.ok(!capturedWirePath.includes(' '), 'wire: no raw spaces');
    assert.ok(capturedWirePath.includes('Artist%20%26%20Band'), 'wire: encodes space and &');
    assert.ok(capturedWirePath.includes('Album%20%2B%20Deluxe'), 'wire: encodes space and +');
    assert.ok(capturedWirePath.includes('track%20%231.mp3'), 'wire: encodes space and #');
  } finally {
    https.request = origRequest;
  }
});

// ── Reject non-Buffer input ──

test('REGRESSION: uploadToB2 rejects non-Buffer input', async () => {
  await assert.rejects(
    () => b2.uploadToB2('key.mp3', 'not-a-buffer', 'audio/mpeg'),
    { message: 'uploadToB2 only accepts Buffer bodies' }
  );
});

// ── Non-2xx B2 response is rejected ──

test('REGRESSION: uploadToB2 rejects on non-2xx B2 response', async () => {
  const body = Buffer.alloc(1024, 0xAB);

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const errorXml = '<Error><Code>RequestAborted</Code><Message>The request body was too small</Message></Error>';
        const res = new Readable({
          read() { this.push(Buffer.from(errorXml)); this.push(null); }
        });
        res.statusCode = 400;
        res.headers = { 'x-amz-request-id': 'test-reject-001' };
        callback(res);
      });
      return req;
    };
    return req;
  };

  try {
    const key = `__regression-test__/${Date.now()}/fail-upload.mp3`;
    await assert.rejects(
      () => b2.uploadToB2(key, body, 'audio/mpeg', 'test-reject'),
      (err) => {
        assert.ok(err.message.includes('B2 PUT failed'), 'error message must prefix with B2 PUT failed');
        assert.equal(err.b2StatusCode, 400, 'must capture HTTP status code');
        return true;
      }
    );
  } finally {
    https.request = origRequest;
  }
});

// ── Return value is always the original key ──

test('REGRESSION: uploadToB2 returns original key, not encoded path', async () => {
  const keyWithSpaces = 'music/Test Artist/Test Album/song.mp3';
  const body = Buffer.alloc(100, 0xCC);

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const res = new Readable({
          read() { this.push(Buffer.from('<PutObjectResult><ETag>"r"</ETag></PutObjectResult>')); this.push(null); }
        });
        res.statusCode = 200;
        res.headers = { 'x-amz-request-id': 'test-return-001' };
        callback(res);
      });
      return req;
    };
    return req;
  };

  try {
    const result = await b2.uploadToB2(keyWithSpaces, body, 'audio/mpeg', 'test-return');
    assert.equal(result, keyWithSpaces, 'return value must be the original key');
  } finally {
    https.request = origRequest;
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
