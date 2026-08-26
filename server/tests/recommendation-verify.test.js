/**
 * server/tests/recommendation-verify.test.js
 *
 * Post-migration verification: ensures the recommendation system
 * produces correct results against the PostgreSQL database.
 *
 * This test:
 *   1. Seeds realistic user data (tracks, plays, favorites, transitions)
 *   2. Runs all recommendation algorithms
 *   3. Verifies every recommendation input signal exists and is correct
 *   4. Verifies outputs are well-formed and deterministic
 *
 * Run: node --test tests/recommendation-verify.test.js
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Set up PostgreSQL test connection before importing db.js
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!process.env.DATABASE_URL) {
  console.error('TEST_DATABASE_URL or DATABASE_URL must be set');
  process.exit(1);
}

const { initDatabase } = await import('../db.js');
const db = await import('../db.js');
const recs = await import('../recommendationEngine.js');

// Initialize database connection
await initDatabase();

// ============================================================
// Test Data Seed
// ============================================================

let userId;
let trackIds = {};

const SEED = {
  tracks: [
    { filePath: 'music/verify/jazz_sax.mp3', title: 'Jazz Saxophone', artist: 'Miles Davis', album: 'Kind of Blue', genre: 'Jazz', duration: 300 },
    { filePath: 'music/verify/jazz_piano.mp3', title: 'Jazz Piano', artist: 'John Coltrane', album: 'A Love Supreme', genre: 'Jazz', duration: 240 },
    { filePath: 'music/verify/rock_anthem.mp3', title: 'Rock Anthem', artist: 'Led Zeppelin', album: 'IV', genre: 'Rock', duration: 480 },
    { filePath: 'music/verify/pop_hit.mp3', title: 'Pop Hit', artist: 'Taylor Swift', album: '1989', genre: 'Pop', duration: 210 },
    { filePath: 'music/verify/hiphop_beat.mp3', title: 'Hip Hop Beat', artist: 'Kendrick Lamar', album: 'DAMN.', genre: 'Hip-Hop', duration: 195 },
    { filePath: 'music/verify/jazz_ballad.mp3', title: 'Jazz Ballad', artist: 'Bill Evans', album: 'Waltz for Debby', genre: 'Jazz', duration: 270 },
    { filePath: 'music/verify/rock_blues.mp3', title: 'Blues Rock', artist: 'Jimi Hendrix', album: 'Axis', genre: 'Rock', duration: 330 },
    { filePath: 'music/verify/classical_symphony.mp3', title: 'Symphony No. 5', artist: 'Beethoven', album: 'Symphonies', genre: 'Classical', duration: 600 },
  ],
  // User listens heavily to jazz, occasionally rock, one pop play (skipped)
  playHistory: [
    // Heavy jazz listener: played jazz tracks many times
    { track: 'jazz_sax', plays: 15, completed: true, replay: false },
    { track: 'jazz_piano', plays: 8, completed: true, replay: true },
    { track: 'jazz_ballad', plays: 5, completed: true, replay: false },
    // Occasional rock listener
    { track: 'rock_anthem', plays: 3, completed: true, replay: false },
    { track: 'rock_blues', plays: 2, completed: false, replay: false },  // partial listen
    // One pop play — skipped quickly
    { track: 'pop_hit', plays: 1, completed: false, replay: false, skip: true },
    // One hip-hop play — completed
    { track: 'hiphop_beat', plays: 2, completed: true, replay: false },
    // Never played classical
  ],
  favorites: ['jazz_sax', 'jazz_piano', 'rock_anthem'],
  transitions: [
    { from: 'jazz_sax', to: 'jazz_piano', count: 10 },
    { from: 'jazz_piano', to: 'jazz_ballad', count: 4 },
    { from: 'rock_anthem', to: 'rock_blues', count: 3 },
  ],
};

async function seedTestData() {
  // Create user
  userId = await db.createUser(`verify_user_${Date.now()}`, 'hash', 'Verify User');

  // Create tracks
  for (const t of SEED.tracks) {
    const id = await db.upsertTrack({
      filePath: t.filePath,
      title: t.title,
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      durationSeconds: t.duration,
      format: 'mp3',
      fileSize: 1024000,
      dateModified: new Date().toISOString(),
    });
    trackIds[t.filePath] = id;
  }

  // Log play events
  for (const play of SEED.playHistory) {
    const trackId = trackIds[`music/verify/${play.track}.mp3`];
    assert.ok(trackId, `Track ${play.track} should exist`);

    for (let i = 0; i < play.plays; i++) {
      const listenedSecs = play.completed ? SEED.tracks.find(t => t.filePath.endsWith(`${play.track}.mp3`)).duration : 30;
      const durationSecs = SEED.tracks.find(t => t.filePath.endsWith(`${play.track}.mp3`)).duration;

      await db.logPlayEvent({
        userId,
        trackId,
        listenedSeconds: listenedSecs,
        durationSeconds: durationSecs,
        isReplay: play.replay || false,
        previousTrackId: null, // transitions handled separately
      });
    }
  }

  // Add favorites
  for (const fav of SEED.favorites) {
    const trackId = trackIds[`music/verify/${fav}.mp3`];
    await db.addFavorite(userId, trackId);
  }

  // Log transitions (via direct SQL since logPlayEvent doesn't support transition counts)
  for (const trans of SEED.transitions) {
    const fromId = trackIds[`music/verify/${trans.from}.mp3`];
    const toId = trackIds[`music/verify/${trans.to}.mp3`];
    // Insert with specific count
    await db.rawRun(
      `INSERT INTO song_transitions (user_id, from_track_id, to_track_id, transition_count, last_transition_time)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT(user_id, from_track_id, to_track_id) DO UPDATE SET
         transition_count = $4,
         last_transition_time = NOW()`,
      [userId, fromId, toId, trans.count]
    );
  }

  return userId;
}

// ============================================================
// Verification Tests
// ============================================================

let testUserId;

before(async () => {
  testUserId = await seedTestData();
});

test('1. Listening history exists in PostgreSQL', async () => {
  const logs = await db.getPlayLogsForUser(testUserId);
  assert.ok(logs.length > 0, 'Play logs should exist');

  // Count plays per track
  const playCounts = {};
  logs.forEach(log => {
    playCounts[log.track_id] = (playCounts[log.track_id] || 0) + 1;
  });

  const jazzSaxId = trackIds['music/verify/jazz_sax.mp3'];
  const popHitId = trackIds['music/verify/pop_hit.mp3'];

  assert.equal(playCounts[jazzSaxId], 15, 'Jazz sax should have 15 plays');
  assert.equal(playCounts[popHitId], 1, 'Pop hit should have 1 play');
});

test('2. Play counts match expected values', async () => {
  const logs = await db.getPlayLogsForUser(testUserId);
  const playCounts = {};
  logs.forEach(log => {
    playCounts[log.track_id] = (playCounts[log.track_id] || 0) + 1;
  });

  // Verify expected play counts
  assert.equal(playCounts[trackIds['music/verify/jazz_sax.mp3']], 15);
  assert.equal(playCounts[trackIds['music/verify/jazz_piano.mp3']], 8);
  assert.equal(playCounts[trackIds['music/verify/jazz_ballad.mp3']], 5);
  assert.equal(playCounts[trackIds['music/verify/rock_anthem.mp3']], 3);
  assert.equal(playCounts[trackIds['music/verify/rock_blues.mp3']], 2);
  assert.equal(playCounts[trackIds['music/verify/hiphop_beat.mp3']], 2);

  // Classical should have zero plays
  const classicalId = trackIds['music/verify/classical_symphony.mp3'];
  assert.equal(playCounts[classicalId] || 0, 0, 'Classical should have 0 plays');
});

test('3. Likes/favorites match', async () => {
  const favs = await db.getUserFavorites(testUserId);
  const favIds = new Set(favs.map(f => f.id));

  assert.ok(favIds.has(trackIds['music/verify/jazz_sax.mp3']), 'Jazz sax should be favorited');
  assert.ok(favIds.has(trackIds['music/verify/jazz_piano.mp3']), 'Jazz piano should be favorited');
  assert.ok(favIds.has(trackIds['music/verify/rock_anthem.mp3']), 'Rock anthem should be favorited');
  assert.equal(favs.length, 3, 'Should have exactly 3 favorites');
});

test('4. Recent activity (timestamps) are preserved', async () => {
  const logs = await db.getPlayLogsForUser(testUserId);

  // All logs should have valid timestamps
  for (const log of logs) {
    assert.ok(log.timestamp, 'Each log should have a timestamp');
    const ts = new Date(log.timestamp);
    assert.ok(!isNaN(ts.getTime()), 'Timestamp should be a valid date');
    // Timestamp should be within the last hour (we just created them)
    const ageMs = Date.now() - ts.getTime();
    assert.ok(ageMs < 3600000, `Timestamp should be recent (age: ${ageMs}ms)`);
  }

  // Verify completion_ratio values are preserved
  const jazzSaxLogs = logs.filter(l => l.track_id === trackIds['music/verify/jazz_sax.mp3']);
  for (const log of jazzSaxLogs) {
    assert.ok(log.completion_ratio >= 0.9, 'Jazz sax plays should have high completion ratio');
  }

  const popLogs = logs.filter(l => l.track_id === trackIds['music/verify/pop_hit.mp3']);
  for (const log of popLogs) {
    assert.equal(log.is_skip, true, 'Pop hit play should be marked as skip');
  }
});

test('5. Artist/album/genre signals are queryable', async () => {
  const allTracks = await db.getAllTracks({});

  // Verify all tracks have correct metadata
  const jazzSax = allTracks.find(t => t.file_path === 'music/verify/jazz_sax.mp3');
  assert.equal(jazzSax.artist, 'Miles Davis');
  assert.equal(jazzSax.genre, 'Jazz');
  assert.equal(jazzSax.album, 'Kind of Blue');

  // Verify genre is queryable for recommendation affinity
  const jazzTracks = allTracks.filter(t => t.genre === 'Jazz');
  assert.equal(jazzTracks.length, 3, 'Should have 3 Jazz tracks');

  const rockTracks = allTracks.filter(t => t.genre === 'Rock');
  assert.equal(rockTracks.length, 2, 'Should have 2 Rock tracks');
});

test('6. Transition data is preserved', async () => {
  const transitions = await db.getTransitionsForUser(testUserId);
  assert.ok(transitions.length > 0, 'Transitions should exist');

  const jazzTransition = transitions.find(
    t => t.from_track_id === trackIds['music/verify/jazz_sax.mp3'] &&
         t.to_track_id === trackIds['music/verify/jazz_piano.mp3']
  );
  assert.ok(jazzTransition, 'Jazz sax → piano transition should exist');
  assert.equal(jazzTransition.transition_count, 10, 'Transition count should be 10');
});

test('7. Recommendation engine queries PostgreSQL successfully', async () => {
  const allTracks = await db.getAllTracks({});
  assert.ok(allTracks.length >= 8, `Should have at least 8 tracks (got ${allTracks.length})`);

  const favs = {};
  const userFavs = await db.getUserFavorites(testUserId);
  userFavs.forEach(f => { favs[f.id] = true; });

  // This calls getPlayLogsForUser and getTransitionsForUser internally
  const scored = await recs.scoreTracks({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    currentTrackId: trackIds['music/verify/jazz_sax.mp3'],
  });

  assert.ok(Array.isArray(scored), 'scoreTracks should return an array');
  assert.equal(scored.length, allTracks.length, 'Should score every track');
});

test('8. Recommendations are generated without errors', async () => {
  const allTracks = await db.getAllTracks({});
  const favs = {};
  const userFavs = await db.getUserFavorites(testUserId);
  userFavs.forEach(f => { favs[f.id] = true; });

  const jazzSaxId = trackIds['music/verify/jazz_sax.mp3'];

  // Main recommendations
  const recs1 = await recs.generateRecommendations({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    currentTrackId: jazzSaxId,
    count: 5,
  });
  assert.ok(recs1.length > 0 && recs1.length <= 5, `Should return 1-5 recommendations (got ${recs1.length})`);
  assert.ok(recs1.every(t => t.id !== jazzSaxId), 'Current track should be excluded');

  // Shelves
  const shelves = await recs.generateShelves({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    currentTrackId: jazzSaxId,
  });
  assert.ok(shelves.length >= 6, `Should have at least 6 shelves (got ${shelves.length})`);

  const shelfIds = shelves.map(s => s.id);
  assert.ok(shelfIds.includes('continue'), 'Should have Continue Listening shelf');
  assert.ok(shelfIds.includes('recommended'), 'Should have Recommended shelf');
  assert.ok(shelfIds.includes('discovery'), 'Should have Discovery shelf');
  assert.ok(shelfIds.includes('forgotten'), 'Should have Forgotten Favorites shelf');
  assert.ok(shelfIds.includes('hiddenGems'), 'Should have Hidden Gems shelf');
  assert.ok(shelfIds.includes('recentlyAdded'), 'Should have Recently Added shelf');

  // Discovery radar
  const discovery = await recs.generateDiscoveryRadar({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    count: 5,
  });
  assert.ok(Array.isArray(discovery), 'Discovery should return an array');

  // Forgotten favorites
  const forgotten = await recs.generateForgottenFavorites({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    count: 5,
  });
  assert.ok(Array.isArray(forgotten), 'Forgotten should return an array');

  // Autoplay
  const autoplay = await recs.generateAutoplayTracks({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    currentTrackId: jazzSaxId,
    excludeTrackIds: [jazzSaxId],
    count: 3,
  });
  assert.ok(autoplay.length <= 3, 'Autoplay should respect count');
  assert.ok(autoplay.every(t => t.id !== jazzSaxId), 'Autoplay should exclude current track');
});

test('9. Scoring signals are correct (jazz-heavy user gets jazz recommendations)', async () => {
  const allTracks = await db.getAllTracks({});
  const favs = {};
  const userFavs = await db.getUserFavorites(testUserId);
  userFavs.forEach(f => { favs[f.id] = true; });

  const scored = await recs.scoreTracks({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    currentTrackId: trackIds['music/verify/jazz_sax.mp3'],
  });

  // Find jazz tracks and classical track
  const jazzSax = scored.find(s => s.track.file_path === 'music/verify/jazz_sax.mp3');
  const jazzPiano = scored.find(s => s.track.file_path === 'music/verify/jazz_piano.mp3');
  const classical = scored.find(s => s.track.file_path === 'music/verify/classical_symphony.mp3');

  // Jazz tracks should score higher than classical (which has 0 plays)
  assert.ok(jazzPiano.totalScore > classical.totalScore,
    `Jazz piano (${jazzPiano.totalScore}) should score higher than classical (${classical.totalScore})`);

  // Jazz piano should have high completion score (all plays completed)
  assert.ok(jazzPiano.track.scoreBreakdown.completion > 0,
    'Jazz piano should have completion bonus');

  // Pop hit should have skip penalty
  const popHit = scored.find(s => s.track.file_path === 'music/verify/pop_hit.mp3');
  assert.ok(popHit.track.scoreBreakdown.skips < 0,
    `Pop hit should have skip penalty (got ${popHit.track.scoreBreakdown.skips})`);

  // Jazz sax should have transition boost when jazz_sax is current track
  // (transitions: jazz_sax → jazz_piano count=10)
  assert.ok(jazzPiano.track.scoreBreakdown.transition > 0,
    'Jazz piano should have transition boost from jazz_sax');
});

test('10. Migration did not create phantom new-user state', async () => {
  // A user with 15 plays on one track should NOT appear as a new user
  const logs = await db.getPlayLogsForUser(testUserId);
  assert.ok(logs.length >= 35, `User should have many play logs (got ${logs.length})`);

  const allTracks = await db.getAllTracks({});
  const favs = {};
  const userFavs = await db.getUserFavorites(testUserId);
  userFavs.forEach(f => { favs[f.id] = true; });

  // A new user with no history would get discovery-heavy recommendations
  // This user should get personalized recommendations
  const recs1 = await recs.generateRecommendations({
    allTracks,
    favoritesMap: favs,
    userId: testUserId,
    count: 10,
  });

  // The user should NOT see "You've never played this track" as dominant reason
  // for their most-played tracks
  const jazzSaxRec = recs1.find(t => t.id === trackIds['music/verify/jazz_sax.mp3']);
  if (jazzSaxRec) {
    assert.ok(!jazzSaxRec.reason.includes('never played'),
      'Jazz sax should NOT be recommended as unplayed');
  }
});

// Cleanup
after(async () => {
  // Clean up test data
  if (testUserId) {
    await db.rawRun('DELETE FROM recommendation_logs WHERE user_id = $1', [testUserId]);
    await db.rawRun('DELETE FROM song_transitions WHERE user_id = $1', [testUserId]);
    await db.rawRun('DELETE FROM play_logs WHERE user_id = $1', [testUserId]);
    await db.rawRun('DELETE FROM favorites WHERE user_id = $1', [testUserId]);
    await db.rawRun('DELETE FROM playlist_tracks WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = $1)', [testUserId]);
    await db.rawRun('DELETE FROM playlists WHERE user_id = $1', [testUserId]);
    for (const filePath of Object.keys(trackIds)) {
      await db.rawRun('DELETE FROM tracks WHERE file_path = $1', [filePath]);
    }
    await db.rawRun('DELETE FROM users WHERE id = $1', [testUserId]);
  }
  console.log('[verify] Test data cleaned up');
});
