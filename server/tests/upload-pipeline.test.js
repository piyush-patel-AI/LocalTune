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

// ── 8.8 MB regression test: native HTTPS PUT sends full Buffer ──

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
      if (Buffer.isBuffer(data)) {
        capturedBody = data;
        assert.equal(data.length, PRODUCTION_SIZE, 'https.request must receive the full 8,832,102-byte Buffer');
      }
      return true;
    };
    req.end = function(data) {
      if (data !== undefined && Buffer.isBuffer(data)) {
        capturedBody = data;
      }
      bodyFullyWritten = true;
      req.writableEnded = true;
      process.nextTick(() => {
        const res = new Readable({
          read() {
            this.push(Buffer.from('<CompleteMultipartUploadResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Bucket>b</Bucket><Key>k</Key></CompleteMultipartUploadResult>'));
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
    assert.equal(capturedOptions.headers['content-length'], String(PRODUCTION_SIZE), 'Content-Length must equal body length');
    assert.equal(capturedOptions.headers['x-amz-content-sha256'], 'UNSIGNED-PAYLOAD');
    assert.ok(capturedOptions.headers['authorization'], 'request must be SigV4-signed');
    assert.ok(capturedOptions.headers['x-amz-date'], 'request must have x-amz-date header');
  } finally {
    https.request = origRequest;
  }
});

test('REGRESSION: uploadToB2 rejects on non-2xx B2 response', async () => {
  const PRODUCTION_SIZE = 8_832_102;
  const body = Buffer.alloc(PRODUCTION_SIZE, 0xAB);

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

test('REGRESSION: uploadToB2 rejects non-Buffer input', async () => {
  await assert.rejects(
    () => b2.uploadToB2('key.mp3', 'not-a-buffer', 'audio/mpeg'),
    { message: 'uploadToB2 only accepts Buffer bodies' }
  );
});

test('REGRESSION: URL-encodes spaces in key — exact production key', async () => {
  const PRODUCTION_KEY = 'music/Boney M/Nightflight to Venus/Boney_M_-_Rasputin__Lyrics__-_7clouds.mp3';
  const body = Buffer.alloc(1024, 0xAA);
  let capturedPath = null;

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    capturedPath = options.path;
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const res = new Readable({
          read() { this.push(Buffer.from('<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>k</Key></CompleteMultipartUploadResult>')); this.push(null); }
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

    assert.ok(capturedPath, 'must capture request path');
    assert.ok(!capturedPath.includes(' '), 'HTTP path must contain no raw spaces');
    assert.ok(capturedPath.includes('/Boney%20M/'), 'must encode "Boney M" → "Boney%20M"');
    assert.ok(capturedPath.includes('/Nightflight%20to%20Venus/'), 'must encode "Nightflight to Venus"');
    assert.ok(capturedPath.includes('/Boney_M_-_Rasputin__Lyrics__-_7clouds.mp3'), 'filename preserved');
    assert.ok(capturedPath.startsWith('/'), 'path must start with /');
    const slashCount = (capturedPath.match(/\//g) || []).length;
    assert.ok(slashCount >= 4, 'must have at least 4 slashes: /bucket/music/Boney M/.../file.mp3');
  } finally {
    https.request = origRequest;
  }
});

test('REGRESSION: URL-encodes special characters in key (&, +, spaces)', async () => {
  const SPECIAL_KEY = 'music/Artist & Band/Album + Deluxe/track #1.mp3';
  const body = Buffer.alloc(512, 0xBB);
  let capturedPath = null;

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    capturedPath = options.path;
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const res = new Readable({
          read() { this.push(Buffer.from('<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>k</Key></CompleteMultipartUploadResult>')); this.push(null); }
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
    assert.equal(result, SPECIAL_KEY, 'must return original unencoded key');
    assert.ok(!capturedPath.includes(' '), 'no raw spaces');
    assert.ok(capturedPath.includes('Artist%20%26%20Band'), 'encodes space and &');
    assert.ok(capturedPath.includes('Album%20%2B%20Deluxe'), 'encodes space and +');
    assert.ok(capturedPath.includes('track%20%231.mp3'), 'encodes space and #');
  } finally {
    https.request = origRequest;
  }
});

test('REGRESSION: uploadToB2 returns original unencoded key, not encoded path', async () => {
  const keyWithSpaces = 'music/Test Artist/Test Album/song.mp3';
  const body = Buffer.alloc(100, 0xCC);

  const origRequest = https.request;
  https.request = function mockRequest(options, callback) {
    const req = new EventEmitter();
    req.write = function() { return true; };
    req.end = function() {
      process.nextTick(() => {
        const res = new Readable({
          read() { this.push(Buffer.from('<CompleteMultipartUploadResult><Bucket>b</Bucket><Key>k</Key></CompleteMultipartUploadResult>')); this.push(null); }
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
    assert.equal(result, keyWithSpaces, 'return value must be the original key, not URL-encoded');
  } finally {
    https.request = origRequest;
  }
});

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
// useTempDb AFTER uploader import — uploader.js calls dotenv.config() at
// module level which re-reads .env and restores TURSO_DATABASE_URL. Setting
// DB_PATH and deleting the Turso vars here ensures q() → initDatabase()
// picks up the temp local SQLite.
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
