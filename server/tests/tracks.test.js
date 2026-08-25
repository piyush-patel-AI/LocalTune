import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('tracks');
const {
  createUser, upsertTrack, getTrackById, getTrackByPath,
  findTrackByTitleAndArtist, updateTrackMetadata, deleteTrackByPath, rekeyTrack,
  createPlaylist, addTrackToPlaylist, getPlaylistTracks,
  addFavorite, getUserFavorites, logPlayEvent, getPlayLogsForUser
} = await import('../db.js');

const track = (filePath, over = {}) => upsertTrack({
  filePath,
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  durationSeconds: 180,
  format: 'mp3',
  fileSize: 1024,
  dateModified: new Date().toISOString(),
  ...over
});

test('upsertTrack inserts a new row and returns its numeric id', async () => {
  const id = await track('music/A/Album/one.mp3');
  assert.equal(typeof id, 'number');
  const t = await getTrackById(id);
  assert.equal(t.file_path, 'music/A/Album/one.mp3');
  assert.equal(t.title, 'Test Song');
  assert.equal(t.duration_seconds, 180);
});

test('re-uploading the same key UPDATES the existing row (no duplicate id)', async () => {
  const id1 = await track('music/A/Album/two.mp3', { title: 'First Pass' });
  const id2 = await track('music/A/Album/two.mp3', { title: 'Second Pass' });
  assert.equal(id2, id1, 'same file_path must map to same track id');
  const t = await getTrackById(id1);
  assert.equal(t.title, 'Second Pass');
});

test('findTrackByTitleAndArtist normalizes whitespace/case', async () => {
  const found = await findTrackByTitleAndArtist('  test song ', ' TEST artist ');
  assert.ok(found);
  assert.ok(found.id > 0);
  assert.equal(await findTrackByTitleAndArtist('', 'x'), null);
});

test('updateTrackMetadata patches only provided fields', async () => {
  const id = await track('music/A/Album/three.mp3', { genre: 'Rock', year: 1999 });
  const updated = await updateTrackMetadata(id, { title: 'Renamed', year: 2001 });
  assert.equal(updated.title, 'Renamed');
  assert.equal(updated.year, 2001);
  assert.equal(updated.genre, 'Rock'); // stored verbatim when explicitly provided
  assert.equal(await updateTrackMetadata(424242, { title: 'ghost' }), null);
});

test('ADOPTION INVARIANT: rekeyTrack preserves id and all child rows', async () => {
  const userId = await createUser('adopter', 'h', 'Adopter');
  const legacyPath = '/home/old-pc/Music/song.mp3';
  const trackId = await track(legacyPath, { title: 'Legacy Song' });

  // Attach children across every table that references tracks
  const plId = await createPlaylist(userId, 'Adoption PL');
  await addTrackToPlaylist(plId, userId, trackId);
  await addFavorite(userId, trackId);
  await logPlayEvent({ userId, trackId, listenedSeconds: 180, durationSeconds: 180 });
  const logsBefore = (await getPlayLogsForUser(userId)).length;
  const favsBefore = (await getUserFavorites(userId)).length;

  // Re-key legacy PC path to a B2-style object key
  await rekeyTrack(legacyPath, 'music/Test Artist/Test Album/song.mp3', 2048, new Date().toISOString());

  const adopted = await getTrackByPath('music/Test Artist/Test Album/song.mp3');
  assert.ok(adopted, 'new key must resolve');
  assert.equal(adopted.id, trackId, 'track id must be preserved by adoption re-key');
  assert.equal(await getTrackByPath(legacyPath), undefined, 'legacy path must be gone');

  const plTracks = await getPlaylistTracks(plId, userId);
  assert.ok(plTracks.some((t) => t.id === trackId), 'playlist membership survives');

  assert.equal((await getUserFavorites(userId)).length, favsBefore, 'favorite survives');
  assert.equal((await getPlayLogsForUser(userId)).length, logsBefore, 'play history survives');
});

test('FRESH PRODUCTION BUILD: empty DB -> uploads only, adoption on re-upload', async () => {
  // Simulates the production cutover exactly: brand-new database (no import,
  // no legacy rows), library constructed purely through uploader-style
  // upsertTrack calls keyed by B2 object keys.
  const userId = await createUser('fresh_user', 'h', 'Fresh');

  const firstId = await track('music/Artist A/Album X/song01.mp3', {
    title: 'Brand New Song', artist: 'Artist A', album: 'Album X'
  });
  const found = await findTrackByTitleAndArtist('Brand New Song', 'Artist A');
  assert.ok(found && found.id === firstId);

  const plId = await createPlaylist(userId, 'Fresh PL');
  await addTrackToPlaylist(plId, userId, firstId);
  await addFavorite(userId, firstId);
  await logPlayEvent({ userId, trackId: firstId, listenedSeconds: 120, durationSeconds: 180 });

  // Re-upload of the same song (same title+artist) must adopt the existing
  // record under its new B2 key — no INSERT, id and history preserved.
  await rekeyTrack(
    'music/Artist A/Album X/song01.mp3',
    'music/Artist A/Album X/song01_v2.mp3', 4096, new Date().toISOString()
  );
  const adopted = await getTrackByPath('music/Artist A/Album X/song01_v2.mp3');
  assert.equal(adopted.id, firstId, 're-upload keeps original track id');
  assert.equal(await getTrackByPath('music/Artist A/Album X/song01.mp3'), undefined);

  const plTracks = await getPlaylistTracks(plId, userId);
  assert.ok(plTracks.some((t) => t.id === firstId));
});

test('deleteTrackByPath removes the row', async () => {
  const id = await track('music/tmp/deleteme.mp3');
  assert.ok(await getTrackById(id));
  await deleteTrackByPath('music/tmp/deleteme.mp3');
  assert.equal(await getTrackById(id), undefined);
});
