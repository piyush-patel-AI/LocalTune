/**
 * server/tests/recommendation-v2.test.js
 *
 * Golden tests for the Octave Recommendation V2 pipeline. Verifies:
 *   1. Multi-source retrieval yields a bounded, deterministic candidate pool.
 *   2. Ranked features attribute a completion/skip/replay to the matching
 *      recommendation impression (outcome attribution telemetry).
 *   3. Session-aware scoring: jazz-heavy user sees jazz recommended before
 *      equally-available pop/rock, and the current-track's top transition
 *      follow-up leads the autoplay queue.
 *   4. Skip suppression: recently-skipped tracks are excluded/pushed down.
 *   5. Diversity caps prevent one artist from flooding a queue.
 *   6. Discovery budget favours never-played taste-anchored tracks.
 *   7. Exploration is deterministic (no randomization) across two runs.
 *   8. Sales surface: shelves reuses the shared ranking (single score pass),
 *      and diagnostics returns a coherent snapshot.
 *
 * Run:  cd server && DATABASE_URL=... TEST_DATABASE_URL=... node --test tests/recommendation-v2.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL or DATABASE_URL must be set');
  process.exit(1);
}

process.env.NODE_ENV = 'test';
const { initDatabase } = await import('../db.js');
const db = await import('../db.js');
const recs = await import('../recommendationEngine.js');

await initDatabase();

const { cleanAllTables } = await import('./helpers.js');

let userId;
let ids = {};
let seedTrackIds = [];

const SEED_TRACKS = [
  { filePath: 'music/v2/a_jazz.mp3', title: 'Jazz A', artist: 'Miles Davis', album: 'Kind of Blue', genre: 'Jazz', dur: 300 },
  { filePath: 'music/v2/b_jazz.mp3', title: 'Jazz B', artist: 'John Coltrane', album: 'A Love Supreme', genre: 'Jazz', dur: 250 },
  { filePath: 'music/v2/c_jazz.mp3', title: 'Jazz C', artist: 'Thelonious Monk', album: 'Straight No Chaser', genre: 'Jazz', dur: 260 },
  { filePath: 'music/v2/d_rock.mp3', title: 'Rock D', artist: 'Led Zeppelin', album: 'IV', genre: 'Rock', dur: 480 },
  { filePath: 'music/v2/e_pop.mp3', title: 'Pop E', artist: 'Taylor Swift', album: '1989', genre: 'Pop', dur: 210 },
  { filePath: 'music/v2/f_classical.mp3', title: 'Classical F', artist: 'Beethoven', album: 'Symphonies', genre: 'Classical', dur: 600 },
];

const DEFAULT_PLAY_ORIGIN = 'manual';

async function seed() {
  await cleanAllTables();
  userId = await db.createUser('v2_user_' + Date.now(), 'hash', 'V2 User');

  for (const t of SEED_TRACKS) {
    const id = await db.upsertTrack({
      filePath: t.filePath, title: t.title, artist: t.artist, album: t.album,
      genre: t.genre, durationSeconds: t.dur, format: 'mp3', fileSize: 1024000,
      dateModified: new Date().toISOString()
    });
    ids[t.filePath] = id;
    seedTrackIds.push(id);
  }

  // Heavy jazz listening: user plays Jazz A many times (completes), Jazz B
  // (completes, loves it), one skip of Pop E, one partial of Rock D.
  const jazzA = ids['music/v2/a_jazz.mp3'];
  const jazzB = ids['music/v2/b_jazz.mp3'];
  const jazzC = ids['music/v2/c_jazz.mp3'];
  const rockD = ids['music/v2/d_rock.mp3'];
  const popE = ids['music/v2/e_pop.mp3'];

  for (let i = 0; i < 6; i++) {
    await db.logPlayEvent({
      userId, trackId: jazzA, listenedSeconds: 300, durationSeconds: 300,
      isReplay: false, previousTrackId: i === 0 ? null : jazzB,
      playOrigin: DEFAULT_PLAY_ORIGIN, sessionId: 'sess_test'
    });
  }
  await db.logPlayEvent({
    userId, trackId: jazzB, listenedSeconds: 250, durationSeconds: 250,
    isReplay: true, previousTrackId: jazzA,
    playOrigin: DEFAULT_PLAY_ORIGIN, sessionId: 'sess_test'
  });
  await db.logPlayEvent({
    userId, trackId: jazzC, listenedSeconds: 200, durationSeconds: 260,
    isReplay: false, previousTrackId: jazzB,
    playOrigin: DEFAULT_PLAY_ORIGIN, sessionId: 'sess_test'
  });
  // User skips pop quickly.
  await db.logPlayEvent({
    userId, trackId: popE, listenedSeconds: 5, durationSeconds: 210,
    isReplay: false, previousTrackId: jazzC,
    playOrigin: DEFAULT_PLAY_ORIGIN, sessionId: 'sess_test'
  });
  // Rock partially listened (not a skip, not completed).
  await db.logPlayEvent({
    userId, trackId: rockD, listenedSeconds: 120, durationSeconds: 480,
    isReplay: false, previousTrackId: popE,
    playOrigin: DEFAULT_PLAY_ORIGIN, sessionId: 'sess_test'
  });

  await db.addFavorite(userId, jazzB);

  // Strong transition jazzA -> jazzB, and a mild jazzB -> jazzC.
  await db.rawRun(
    `INSERT INTO song_transitions (user_id, from_track_id, to_track_id, transition_count, last_transition_time)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT(user_id, from_track_id, to_track_id) DO UPDATE SET transition_count = EXCLUDED.transition_count`,
    [userId, jazzA, jazzB, 12]
  );
  await db.rawRun(
    `INSERT INTO song_transitions (user_id, from_track_id, to_track_id, transition_count, last_transition_time)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT(user_id, from_track_id, to_track_id) DO UPDATE SET transition_count = EXCLUDED.transition_count`,
    [userId, jazzB, jazzC, 4]
  );
}

async function loadFavorites() {
  const favs = (await db.getUserFavorites(userId));
  const map = {};
  favs.forEach((f) => { map[f.id] = true; });
  return map;
}

before(async () => { await seed(); });

test('1. retrieval pool is bounded, deterministic and multi-source', async () => {
  const discard = null;
  const allTracks = await db.getAllTracks({});
  const favoritesMap = await loadFavorites();
  const current = ids['music/v2/a_jazz.mp3'];
  const ctx = await recs.buildPipelineContext({ allTracks, favoritesMap, userId, currentTrackId: current });
  const { gatherCandidates } = await import('../recommendation/retrieval.js');
  const once = gatherCandidates({ ctx, currentTrackId: current, poolSize: 60 });
  const twice = gatherCandidates({ ctx, currentTrackId: current, poolSize: 60 });
  assert.ok(Array.isArray(once.pool) && once.pool.length > 0, 'pool has candidates');
  assert.ok(once.pool.length <= 60, 'pool is bounded by candidateLimit');
  assert.deepEqual(once.pool.map((c) => c.track.id), twice.pool.map((c) => c.track.id), 'retrieval is deterministic');

  // Candidate pool should include tracks with affinity to the user's jazz taste
  // and the current track's matching set.
  const idsInPool = new Set(once.byId.keys());
  const jazzB = ids['music/v2/b_jazz.mp3'];
  assert.ok(idsInPool.has(jazzB) || once.meta.counts.transition > 0, 'transition source produced candidates');
  void discard;
});

test('2. outcome attribution: play backfils listened/completion onto recommendation log', async () => {
  const trackId = ids['music/v2/c_jazz.mp3'];
  // Simulate a 'shown' impression the client would emit.
  await db.logRecommendationAction({
    userId, trackId, shelfId: 'recommended', action: 'shown',
    source: 'recommended', surface: 'recommended', sessionId: 'sess_test'
  });
  // Client completes the track.
  await db.logPlayEvent({
    userId, trackId, listenedSeconds: 260, durationSeconds: 260,
    isReplay: false, previousTrackId: ids['music/v2/b_jazz.mp3'],
    playOrigin: 'autoplay', sessionId: 'sess_test'
  });

  const rows = await db.getRecommendationLogsForUser(userId, { limit: 50 });
  const recRow = rows.find((r) => r.track_id === trackId && r.action === 'shown');
  assert.ok(recRow, 'impression row exists');
  assert.equal(recRow.completion_ratio, 1, 'completion_ratio backfilled to 1');
  assert.equal(recRow.is_skip, false, 'not a skip');
});

test('3. jazz-heavy user is recommended jazz before pop/rock; pop ranked down by skip', async () => {
  const allTracks = await db.getAllTracks({});
  const favoritesMap = await loadFavorites();
  const current = ids['music/v2/a_jazz.mp3'];
  const scored = await recs.scoreTracks({ allTracks, favoritesMap, userId, currentTrackId: current });

  const scoreOf = (path) => scored.find((s) => s.track.file_path === path).totalScore;
  const jazzB = scoreOf('music/v2/b_jazz.mp3');
  const popE = scoreOf('music/v2/e_pop.mp3');
  const rockD = scoreOf('music/v2/d_rock.mp3');

  assert.ok(jazzB > popE, `jazz B (${jazzB}) outranks pop (${popE})`);
  assert.ok(jazzB > rockD, `jazz B (${jazzB}) outranks rock (${rockD})`);

  // The skipped pop track should carry a negative skips component.
  const popRow = scored.find((s) => s.track.file_path === 'music/v2/e_pop.mp3');
  assert.ok(popRow.track.scoreBreakdown.skips < 0, `pop has skip penalty (${popRow.track.scoreBreakdown.skips})`);

  // Recommendation surface excludes the current track and is deterministic.
  const recs1 = await recs.generateRecommendations({ allTracks, favoritesMap, userId, currentTrackId: current, count: 5 });
  assert.ok(recs1.every((t) => t.id !== current), 'current track excluded');
  const recs2 = await recs.generateRecommendations({ allTracks, favoritesMap, userId, currentTrackId: current, count: 5 });
  assert.deepEqual(recs1.map((t) => t.id), recs2.map((t) => t.id), 'recommendations deterministic');
});

test('4. autoplay leads with the highest-confidence transition follow-up', async () => {
  const allTracks = await db.getAllTracks({});
  const favoritesMap = await loadFavorites();
  const current = ids['music/v2/a_jazz.mp3']; // -> jazzB has the strongest transition
  const autoplay = await recs.generateAutoplayTracks({
    allTracks, favoritesMap, userId, currentTrackId: current, count: 5
  });
  assert.ok(autoplay.length <= 5);
  const ids2 = autoplay.map((t) => t.id);
  assert.ok(!ids2.includes(current), 'autoplay excludes current');
  assert.equal(new Set(ids2).size, ids2.length, 'autoplay has no duplicates');
  // The strongest learned transition target (jazzB) should appear early in queue.
  const pos = ids2.indexOf(ids['music/v2/b_jazz.mp3']);
  assert.ok(pos >= 0 && pos < 2, `highest-confidence follow-up near front (pos=${pos})`);
});

test('5. diversity caps prevent one artist from flooding the queue', async () => {
  // Force a pool dominated by jazz.
  const allTracks = await db.getAllTracks({});
  const favoritesMap = await loadFavorites();
  const current = ids['music/v2/b_jazz.mp3'];
  const recs1 = await recs.generateRecommendations({ allTracks, favoritesMap, userId, currentTrackId: current, count: 6 });

  const artistCounts = {};
  for (const t of recs1) {
    const artist = t.artist;
    artistCounts[artist] = (artistCounts[artist] || 0) + 1;
  }
  for (const [artist, n] of Object.entries(artistCounts)) {
    assert.ok(n <= 2, `artist "${artist}" appears at most 2x (got ${n})`);
  }
});

test('6. exploration is deterministic (two identical runs select the same tracks)', async () => {
  const allTracks = await db.getAllTracks({});
  const favoritesMap = await loadFavorites();
  const a1 = await recs.generateDiscoveryRadar({ allTracks, favoritesMap, userId, count: 10 });
  const a2 = await recs.generateDiscoveryRadar({ allTracks, favoritesMap, userId, count: 10 });
  assert.deepEqual(a1.map((t) => t.id), a2.map((t) => t.id), 'discovery radar deterministic');
});

test('7. discovery budget favours never-played taste-anchored tracks', async () => {
  const allTracks = await db.getAllTracks({});
  const favoritesMap = await loadFavorites();
  const radar = await recs.generateDiscoveryRadar({ allTracks, favoritesMap, userId, count: 10 });
  const classicalId = ids['music/v2/f_classical.mp3'];
  // Classical was NEVER played and has zero affinity -> must not rank above the
  // jazz/rock taste-anchored never-played candidates (all jazz lovers).
  const classicalIdx = radar.findIndex((t) => t.id === classicalId);
  assert.ok(classicalIdx === -1 || classicalIdx > 2, `classical not at the very top (idx=${classicalIdx})`);
});

test('8. shelves reuse a shared ranking and expose all six shelves + diagnostics', async () => {
  const allTracks = await db.getAllTracks({});
  const favoritesMap = await loadFavorites();
  const current = ids['music/v2/a_jazz.mp3'];

  const shelves = await recs.generateShelves({ allTracks, favoritesMap, userId, currentTrackId: current });
  const ids3 = shelves.map((s) => s.id);
  for (const expected of ['continue', 'recommended', 'discovery', 'forgotten', 'hiddenGems', 'recentlyAdded']) {
    assert.ok(ids3.includes(expected), `shelf ${expected} present`);
  }

  const diag = await recs.getRecommendationDiagnostics({ allTracks, favoritesMap, userId, currentTrackId: current, limit: 5 });
  assert.equal(diag.algorithm.version, 'v2');
  assert.ok(Array.isArray(diag.top) && diag.top.length <= 5, 'diagnostics top slice present');
  assert.ok(typeof diag.discoveryBudget === 'number', 'discovery budget is a number');
});

test('9. getPlayLogsForUser respects an explicit limit', async () => {
  const limited = await db.getPlayLogsForUser(userId, { limit: 3 });
  assert.ok(limited.length <= 3, 'limit honored');
});

after(async () => {
  if (userId) {
    await db.rawRun('DELETE FROM recommendation_logs WHERE user_id = $1', [userId]);
    await db.rawRun('DELETE FROM song_transitions WHERE user_id = $1', [userId]);
    await db.rawRun('DELETE FROM play_logs WHERE user_id = $1', [userId]);
    await db.rawRun('DELETE FROM favorites WHERE user_id = $1', [userId]);
    for (const id of seedTrackIds) await db.rawRun('DELETE FROM tracks WHERE id = $1', [id]);
    await db.rawRun('DELETE FROM users WHERE id = $1', [userId]);
  }
});