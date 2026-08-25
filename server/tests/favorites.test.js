import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('favorites');
const {
  createUser, upsertTrack, addFavorite, removeFavorite,
  getUserFavorites, isFavorite
} = await import('../db.js');

async function mkTrack(p) {
  return upsertTrack({
    filePath: p, title: p, artist: 'Fav Artist', album: 'FA',
    durationSeconds: 100, format: 'mp3', fileSize: 10,
    dateModified: new Date().toISOString()
  });
}

test('favorites lifecycle: add -> listed -> isFavorite -> remove -> gone', async () => {
  const userId = await createUser('fav_user', 'h', 'Fav');
  const t1 = await mkTrack('music/fav/one.mp3');
  const t2 = await mkTrack('music/fav/two.mp3');

  await addFavorite(userId, t1);
  await addFavorite(userId, t2);
  await addFavorite(userId, t2); // duplicate toggle must not double-insert

  assert.equal(await isFavorite(userId, t1), true);
  assert.equal(await isFavorite(userId, 999999), false);

  const favs = await getUserFavorites(userId);
  assert.equal(favs.length, 2, 'duplicate favorite ignored');
  assert.ok(favs.every((f) => f.favorited_at), 'rows carry favorited_at join column');

  await removeFavorite(userId, t1);
  assert.equal(await isFavorite(userId, t1), false);
  assert.equal((await getUserFavorites(userId)).length, 1);
});

test('favorites are isolated per user', async () => {
  const uA = await createUser('fav_a', 'h', 'A');
  const uB = await createUser('fav_b', 'h', 'B');
  const t = await mkTrack('music/fav/shared.mp3');

  await addFavorite(uA, t);
  assert.equal(await isFavorite(uA, t), true);
  assert.equal(await isFavorite(uB, t), false);
});
