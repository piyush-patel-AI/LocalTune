import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('recs');
const {
  createUser, upsertTrack, addFavorite, logPlayEvent, getAllTracks,
  getTrackById, updateRecommendationStats
} = await import('../db.js');
const recs = await import('../recommendationEngine.js');

async function mk(userId, p, artist, genre) {
  return upsertTrack({
    filePath: p, title: `Title ${p}`, artist, album: `Album ${artist}`,
    genre, durationSeconds: 120, format: 'mp3', fileSize: 10,
    dateModified: new Date().toISOString()
  });
}

async function seedLibrary() {
  const userId = await createUser(`rec_user_${Math.random()}`, 'h', 'Rec User');
  const jazzA = await mk(userId, 'music/rec/jazz1.mp3', 'Jazz Artist', 'Jazz');
  const jazzB = await mk(userId, 'music/rec/jazz2.mp3', 'Jazz Artist', 'Jazz');
  const rock = await mk(userId, 'music/rec/rock.mp3', 'Rock Band', 'Rock');
  const pop = await mk(userId, 'music/rec/pop.mp3', 'Pop Star', 'Pop');

  // History: user loves jazz, played jazzA -> jazzB repeatedly
  for (let i = 0; i < 3; i++) {
    await logPlayEvent({ userId, trackId: jazzB, listenedSeconds: 120, durationSeconds: 120, previousTrackId: jazzA });
  }
  await addFavorite(userId, jazzB);
  return { userId, jazzA, jazzB, rock, pop };
}

test('scoreTracks returns async scored rows with breakdowns and reasons', async () => {
  const { userId, jazzA } = await seedLibrary();
  const allTracks = await getAllTracks();
  const favs = {};
  favs[(await getAllTracks()).find((t) => t.file_path === 'music/rec/jazz2.mp3').id] = true;

  const scored = await recs.scoreTracks({ allTracks, favoritesMap: favs, userId, currentTrackId: jazzA });
  assert.ok(Array.isArray(scored) && scored.length === allTracks.length);
  for (const s of scored) {
    assert.equal(typeof s.totalScore, 'number');
    assert.ok(s.track.scoreBreakdown);
    assert.ok(typeof s.track.reason === 'string' && s.track.reason.length > 0);
    assert.ok(Array.isArray(s.logs));
  }
  // Transition learning must fire for the repeated pair
  const jazzBRow = scored.find((s) => s.track.file_path === 'music/rec/jazz2.mp3');
  assert.ok(jazzBRow.track.scoreBreakdown.transition > 0, 'transition boost applied');
});

test('generateRecommendations respects count, excludes current track, unique ids', async () => {
  const { userId, jazzA } = await seedLibrary();
  const allTracks = await getAllTracks();
  const out = await recs.generateRecommendations({ allTracks, userId, currentTrackId: jazzA, count: 2 });

  assert.ok(out.length <= 2);
  assert.equal(new Set(out.map((t) => t.id)).size, out.length, 'no duplicate recommendations');
  assert.ok(out.every((t) => t.id !== jazzA), 'current track excluded');
});

test('updateRecommendationStats stamps last_recommended_at on selected tracks', async () => {
  const { userId, pop } = await seedLibrary();
  const allTracks = await getAllTracks();
  const before = (await getTrackById(pop)).last_recommended_at;

  await updateRecommendationStats(pop);
  const after = (await getTrackById(pop)).last_recommended_at;
  assert.ok(after, 'last_recommended_at set');
});

test('cache returns identical reference until invalidated', async () => {
  const { userId } = await seedLibrary();
  const allTracks = await getAllTracks();

  const first = await recs.generateRecommendations({ allTracks, userId, count: 5 });
  const cached = await recs.generateRecommendations({ allTracks, userId, count: 5 });
  assert.equal(cached, first, 'second call hits cache');

  recs.invalidateRecommendationCache(userId);
  const fresh = await recs.generateRecommendations({ allTracks, userId, count: 5 });
  assert.notEqual(fresh, first, 'invalidateRecommendationCache forces recompute');
  assert.deepEqual(fresh.map((t) => t.id), first.map((t) => t.id), 'deterministic given same data');
});

test('all five generators resolve to well-formed output', async () => {
  const { userId, jazzA } = await seedLibrary();
  const allTracks = await getAllTracks();
  const favs = {};

  const discovery = await recs.generateDiscoveryRadar({ allTracks, favoritesMap: favs, userId, count: 3 });
  assert.ok(discovery.length <= 3);

  const forgotten = await recs.generateForgottenFavorites({ allTracks, favoritesMap: favs, userId, count: 3 });
  assert.ok(forgotten.length <= 3);

  const autoplay = await recs.generateAutoplayTracks({
    allTracks, favoritesMap: favs, userId, currentTrackId: jazzA,
    excludeTrackIds: [jazzA], count: 4
  });
  assert.ok(autoplay.every((t) => t.id !== jazzA));

  const shelves = await recs.generateShelves({ allTracks, favoritesMap: favs, userId, currentTrackId: jazzA });
  const ids = shelves.map((s) => s.id);
  for (const expected of ['continue', 'recommended', 'discovery', 'forgotten', 'hiddenGems', 'recentlyAdded']) {
    assert.ok(ids.includes(expected), `shelf ${expected} present`);
    const shelf = shelves.find((s) => s.id === expected);
    assert.ok(shelf.tracks.length <= 12);
  }
});
