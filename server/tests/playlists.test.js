import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('playlists');
const {
  createUser, upsertTrack, createPlaylist, getPlaylistById,
  addTrackToPlaylist, removeTrackFromPlaylist, reorderPlaylistTracks, getPlaylistTracks
} = await import('../db.js');

async function seed() {
  const userId = await createUser(`pl_user_${Math.random()}`, 'h', 'PL User');
  const otherId = await createUser(`pl_other_${Math.random()}`, 'h', 'Other');
  const plId = await createPlaylist(userId, 'Reorder Me');
  const trackIds = [];
  for (let i = 0; i < 3; i++) {
    const tid = await upsertTrack({
      filePath: `music/pl/${i}.mp3`, title: `T${i}`, artist: `A${i}`,
      album: 'AL', durationSeconds: 60, format: 'mp3', fileSize: 10,
      dateModified: new Date().toISOString()
    });
    trackIds.push(tid);
    await addTrackToPlaylist(plId, userId, tid);
  }
  return { userId, otherId, plId, trackIds };
}

test('createPlaylist returns numeric id; ownership lookup works', async () => {
  const { userId, plId } = await seed();
  assert.equal(typeof plId, 'number');
  const pl = await getPlaylistById(plId, userId);
  assert.ok(pl && pl.sample_tracks !== undefined, 'getPlaylistById enriches with sample_tracks');
});

test('addTrackToPlaylist appends positions in insertion order; duplicate add is a no-op', async () => {
  const { userId, plId, trackIds } = await seed();
  let tracks = await getPlaylistTracks(plId, userId);
  assert.deepEqual(tracks.map((t) => t.id), trackIds);

  await addTrackToPlaylist(plId, userId, trackIds[0]); // duplicate
  tracks = await getPlaylistTracks(plId, userId);
  assert.equal(tracks.length, 3, 'duplicate insert must not create a second entry');
});

test('reorderPlaylistTracks applies exact requested order atomically', async () => {
  const { userId, plId, trackIds } = await seed();
  const reordered = [trackIds[2], trackIds[0], trackIds[1]];
  const ok = await reorderPlaylistTracks(plId, userId, reordered);
  assert.equal(ok, true);

  const tracks = await getPlaylistTracks(plId, userId);
  assert.deepEqual(tracks.map((t) => t.id), reordered);
  assert.deepEqual(tracks.map((t) => t.position), [0, 1, 2]);
});

test('reorder rejects non-owner (returns false)', async () => {
  const { otherId, plId } = await seed();
  assert.equal(await reorderPlaylistTracks(plId, otherId, [1]), false);
  assert.equal(await getPlaylistTracks(plId, otherId), null);
  assert.equal(await getPlaylistById(999999, 1), null);
});

test('removeTrackFromPlaylist removes once then reports absence via order', async () => {
  const { userId, plId, trackIds } = await seed();
  assert.equal(await removeTrackFromPlaylist(plId, userId, trackIds[1]), true);
  const tracks = await getPlaylistTracks(plId, userId);
  assert.deepEqual(tracks.map((t) => t.id), [trackIds[0], trackIds[2]]);
});
