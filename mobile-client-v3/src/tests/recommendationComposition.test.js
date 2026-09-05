import assert from 'node:assert';
import { test, describe } from 'node:test';
import {
  classifyCandidates,
  buildSpeedDialPages,
  buildQuickPicks,
} from '../services/recommendationComposition.js';

describe('Recommendation Composition Engine', () => {
  const mockCandidates = Array.from({ length: 30 }, (_, i) => ({
    id: i + 1,
    title: `Track ${i + 1}`,
    artist: `Artist ${Math.floor(i / 3) + 1}`,
    play_count: i < 5 ? 10 : 1,
  }));

  const mockFavoritesMap = { 6: true, 7: true };
  const mockListenHistory = [{ id: 1 }, { id: 2 }];

  test('classifyCandidates correctly buckets discovery, familiar, and recent', () => {
    const classified = classifyCandidates({
      candidatePool: mockCandidates,
      favoritesMap: mockFavoritesMap,
      listenHistory: mockListenHistory,
    });

    assert.strictEqual(classified.recent.length, 2);
    assert.ok(classified.recent.some((t) => t.id === 1));

    assert.strictEqual(classified.familiar.length, 5);
    assert.ok(classified.familiar.some((t) => t.id === 6));

    assert.strictEqual(classified.discovery.length, 23);
  });

  test('buildSpeedDialPages generates 3x3 9-track pages with target composition and artist diversity', () => {
    const pages = buildSpeedDialPages({
      candidatePool: mockCandidates,
      favoritesMap: mockFavoritesMap,
      listenHistory: mockListenHistory,
      pageCount: 2,
      pageSize: 9,
    });

    assert.strictEqual(pages.length, 2);
    assert.strictEqual(pages[0].length, 9);
    assert.strictEqual(pages[1].length, 9);

    const artistCountsPage1 = new Map();
    for (const track of pages[0]) {
      const art = track.artist;
      artistCountsPage1.set(art, (artistCountsPage1.get(art) || 0) + 1);
    }
    for (const [artist, count] of artistCountsPage1) {
      assert.ok(count <= 2, `Artist ${artist} has count ${count} exceeding limit of 2`);
    }

    const page1Ids = new Set(pages[0].map((t) => t.id));
    for (const track of pages[1]) {
      assert.ok(!page1Ids.has(track.id), `Track ${track.id} duplicated across page 1 and page 2`);
    }
  });

  test('buildSpeedDialPages fills 9-track pages from candidate pool even when quota buckets are small', () => {
    // 2 recs + 15 lib tracks = 17 tracks
    const smallCandidates = Array.from({ length: 17 }, (_, i) => ({
      id: i + 1,
      title: `Track ${i + 1}`,
      artist: `Artist ${i + 1}`,
      play_count: 0,
    }));

    const pages = buildSpeedDialPages({
      candidatePool: smallCandidates,
      favoritesMap: {},
      listenHistory: [],
      pageCount: 1,
      pageSize: 9,
    });

    assert.strictEqual(pages[0].length, 9);
  });

  test('buildSpeedDialPages handles small candidate pool gracefully without crashing', () => {
    const smallPool = mockCandidates.slice(0, 5);
    const pages = buildSpeedDialPages({
      candidatePool: smallPool,
      favoritesMap: {},
      listenHistory: [],
      pageCount: 2,
      pageSize: 9,
    });

    assert.ok(pages.length >= 1);
    assert.strictEqual(pages[0].length, 5);
  });

  test('buildSpeedDialPages performs deterministic candidate window sliding on refresh offset', () => {
    const pagesDefault = buildSpeedDialPages({
      candidatePool: mockCandidates,
      pageOffset: 0,
    });

    const pagesOffset1 = buildSpeedDialPages({
      candidatePool: mockCandidates,
      pageOffset: 1,
    });

    assert.notDeepStrictEqual(pagesDefault[0], pagesOffset1[0]);
  });

  test('buildQuickPicks creates distinct recommendation pool excluding Speed Dial track IDs', () => {
    const speedDialTrackIds = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const quickPicks = buildQuickPicks({
      candidatePool: mockCandidates,
      speedDialTrackIds,
      limit: 8,
    });

    assert.strictEqual(quickPicks.length, 8);
    for (const track of quickPicks) {
      assert.ok(!speedDialTrackIds.has(track.id), `Quick pick track ${track.id} overlaps with Speed Dial`);
    }
  });
});
