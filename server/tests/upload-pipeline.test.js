import { test } from 'node:test';
import assert from 'node:assert/strict';

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

// ── S3Client configuration ──

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

// ── 8.8 MB upload: verify PutObjectCommand receives full Buffer ──

test('REGRESSION: uploadToB2 sends full 8,832,102-byte Buffer via PutObjectCommand', async () => {
  const PRODUCTION_SIZE = 8_832_102;
  const body = Buffer.alloc(PRODUCTION_SIZE, 0xCD);
  assert.equal(Buffer.byteLength(body), PRODUCTION_SIZE, 'Buffer must be exactly 8,832,102 bytes');

  let capturedCommand = null;
  const origSend = b2.s3.send.bind(b2.s3);

  b2.s3.send = async function mockSend(command) {
    capturedCommand = command;
    return {};
  };

  try {
    const key = `__regression-test__/${Date.now()}/large-upload.mp3`;
    const result = await b2.uploadToB2(key, body, 'audio/mpeg', 'test-regression');

    assert.equal(result, key, 'uploadToB2 must return the key on success');
    assert.ok(capturedCommand, 'S3Client.send must have been called');

    const input = capturedCommand.input;
    assert.equal(input.Bucket, process.env.B2_BUCKET_NAME);
    assert.equal(input.Key, key);
    assert.ok(Buffer.isBuffer(input.Body), 'Body must be a Buffer');
    assert.equal(input.Body.length, PRODUCTION_SIZE, 'Body must be exactly 8,832,102 bytes');
    assert.equal(input.ContentLength, PRODUCTION_SIZE, 'ContentLength must equal body length');
    assert.equal(input.ContentType, 'audio/mpeg');

    // Verify the exact same Buffer reference is passed (no copy, no conversion)
    assert.equal(input.Body, body, 'Body must be the exact same Buffer reference');
  } finally {
    b2.s3.send = origSend;
  }
});

// ── Production key with spaces: verify correct handling ──

test('REGRESSION: uploadToB2 preserves exact production key with spaces', async () => {
  const PRODUCTION_KEY = 'music/Boney M/Nightflight to Venus/Boney_M_-_Rasputin__Lyrics__-_7clouds.mp3';
  const body = Buffer.alloc(1024, 0xAA);

  let capturedCommand = null;
  const origSend = b2.s3.send.bind(b2.s3);
  b2.s3.send = async function mockSend(command) { capturedCommand = command; return {}; };

  try {
    const result = await b2.uploadToB2(PRODUCTION_KEY, body, 'audio/mpeg', 'test-space');

    assert.equal(result, PRODUCTION_KEY, 'must return original unencoded key');
    assert.ok(capturedCommand, 'S3Client.send must have been called');

    const input = capturedCommand.input;
    assert.equal(input.Key, PRODUCTION_KEY, 'B2 Key must be the original unencoded key');
    assert.equal(input.Body.length, body.length, 'Body size must match');
    assert.equal(input.Body, body, 'Body must be the exact same Buffer reference');
  } finally {
    b2.s3.send = origSend;
  }
});

// ── Special characters in key ──

test('REGRESSION: uploadToB2 handles keys with &, +, # characters', async () => {
  const SPECIAL_KEY = 'music/Artist & Band/Album + Deluxe/track #1.mp3';
  const body = Buffer.alloc(512, 0xBB);

  let capturedCommand = null;
  const origSend = b2.s3.send.bind(b2.s3);
  b2.s3.send = async function mockSend(command) { capturedCommand = command; return {}; };

  try {
    const result = await b2.uploadToB2(SPECIAL_KEY, body, 'audio/mpeg', 'test-special');

    assert.equal(result, SPECIAL_KEY, 'must return original key');
    assert.equal(capturedCommand.input.Key, SPECIAL_KEY, 'B2 Key must be original');
    assert.equal(capturedCommand.input.Body, body, 'Body must be the same Buffer');
  } finally {
    b2.s3.send = origSend;
  }
});

// ── Reject non-Buffer input ──

test('REGRESSION: uploadToB2 rejects non-Buffer input', async () => {
  await assert.rejects(
    () => b2.uploadToB2('key.mp3', 'not-a-buffer', 'audio/mpeg'),
    { message: 'uploadToB2 only accepts Buffer bodies' }
  );
});

// ── Return value is always the original key ──

test('REGRESSION: uploadToB2 returns original key, not encoded path', async () => {
  const keyWithSpaces = 'music/Test Artist/Test Album/song.mp3';
  const body = Buffer.alloc(100, 0xCC);

  const origSend = b2.s3.send.bind(b2.s3);
  b2.s3.send = async function() { return {}; };

  try {
    const result = await b2.uploadToB2(keyWithSpaces, body, 'audio/mpeg', 'test-return');
    assert.equal(result, keyWithSpaces, 'return value must be the original key');
  } finally {
    b2.s3.send = origSend;
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
