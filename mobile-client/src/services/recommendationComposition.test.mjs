// Zero-dependency node tests for the pure recommendation composition helpers.
// Run with: node src/services/recommendationComposition.test.mjs
import assert from 'node:assert/strict';
import {
  composeSpeedDial,
  composeQuickPicks,
  composeRefreshWindow,
  classifyTrack,
  pageCountFor
} from './recommendationComposition.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL - ${name}`);
    console.error(err.message);
  }
}

function track(id, artist = `Artist ${id}`, genre = 'Pop', extra = {}) {
  return { id, title: `Title ${id}`, artist, genre, album: 'Album', reason: 'Recommended for you', ...extra };
}

// --- classifyTrack ---
test('classifyTrack: recent by id', () => {
  assert.equal(classifyTrack(track(5), { recentlyPlayedIds: [5] }), 'recent');
});
test('classifyTrack: familiar by favorite', () => {
  assert.equal(classifyTrack(track(5), { favoriteIds: [5] }), 'familiar');
});
test('classifyTrack: familiar by high recommendation_count', () => {
  assert.equal(classifyTrack(track(5, 'A', 'P', { recommendation_count: 9 })), 'familiar');
});
test('classifyTrack: discovery by reason + default', () => {
  assert.equal(classifyTrack(track(1, 'A', 'P', { reason: "You've never played this track", recommendation_count: 0 })), 'discovery');
  assert.equal(classifyTrack(track(2, 'A', 'P', { recommendation_count: 0 })), 'discovery');
});
test('classifyTrack: recent wins over favorite', () => {
  assert.equal(classifyTrack(track(5), { recentlyPlayedIds: [5], favoriteIds: [5] }), 'recent');
});

// --- pageCountFor ---
test('pageCountFor: dynamic 0/1/2/3', () => {
  assert.equal(pageCountFor(0), 0);
  assert.equal(pageCountFor(1), 1);
  assert.equal(pageCountFor(9), 1);
  assert.equal(pageCountFor(10), 2);
  assert.equal(pageCountFor(18), 2);
  assert.equal(pageCountFor(20), 3);
  assert.equal(pageCountFor(27), 3);
  assert.equal(pageCountFor(40), 3); // capped at 3
});

// --- composeSpeedDial ---
test('composeSpeedDial: empty pool -> no pages', () => {
  const { pages, pageCount } = composeSpeedDial([]);
  assert.equal(pages.length, 0);
  assert.equal(pageCount, 0);
});

test('composeSpeedDial: 20 tracks -> 3 pages (9/9/2), discovery mix (case A)', () => {
  const ids = Array.from({ length: 20 }, (_, i) => i + 1);
  const pool = ids.map((id) => track(id));
  const { pages, pageCount } = composeSpeedDial(pool);
  assert.equal(pageCount, 3);
  assert.deepEqual(pages.map((p) => p.length), [9, 9, 2]);
});

test('composeSpeedDial: honors 5 discovery / 2 familiar / 2 recent per full page (case B)', () => {
  const discovery = Array.from({ length: 12 }, (_, i) => track(100 + i, 'D Artist ' + (i % 3), 'Rock'));
  const familiar = Array.from({ length: 8 }, (_, i) => track(200 + i, 'F Artist ' + (i % 3), 'Jazz', { recommendation_count: 9 }));
  const recent = Array.from({ length: 6 }, (_, i) => track(300 + i, 'R Artist ' + (i % 3), 'Blues'));
  const pool = [...discovery, ...familiar, ...recent];
  const { pages, placement } = composeSpeedDial(pool, {
    recentlyPlayedIds: recent.map((t) => t.id),
    favoriteIds: []
  });
  // Every full 9-track page should carry the requested 5/2/2 mix.
  for (const page of pages) {
    if (page.length < 9) continue;
    const counts = { discovery: 0, familiar: 0, recent: 0 };
    for (const t of page) counts[placement[Number(t.id)]] += 1;
    assert.deepEqual(counts, { discovery: 5, familiar: 2, recent: 2 });
  }
});

test('composeSpeedDial: recent-continuity lanes respected (case B)', () => {
  const discovery = Array.from({ length: 12 }, (_, i) => track(100 + i, 'D Artist ' + (i % 3), 'Rock'));
  const familiar = Array.from({ length: 8 }, (_, i) => track(200 + i, 'F Artist ' + (i % 3), 'Jazz', { recommendation_count: 9 }));
  const recent = Array.from({ length: 6 }, (_, i) => track(300 + i, 'R Artist ' + (i % 3), 'Blues'));
  const pool = [...discovery, ...familiar, ...recent];
  const { pages, pageCount, placement } = composeSpeedDial(pool, {
    recentlyPlayedIds: recent.map((t) => t.id),
    favoriteIds: []
  });
  assert.equal(pageCount, 3);
  const full = pages.flat();
  // every placed track classified
  for (const t of full) assert.ok(placement[Number(t.id)]);
  // dedupe across the whole Speed Dial
  const seen = new Set(full.map((t) => Number(t.id)));
  assert.equal(seen.size, full.length);
  // at least one recent track placed
  const isRecent = (t) => placement[Number(t.id)] === 'recent';
  assert.ok(full.some(isRecent));
  // recent only come from the recent pool
  for (const t of full.filter(isRecent)) assert.ok(recent.some((r) => r.id === t.id));
});

test('composeSpeedDial: artist cap (<=2 per artist per page) enforced when enough artists (case C)', () => {
  // 6 distinct artists -> a 9-track page can hold <=2 of each.
  const pool = Array.from({ length: 30 }, (_, i) => track(i + 1, `Artist ${(i % 6) + 1}`));
  const { pages } = composeSpeedDial(pool, { maxPerPageArtist: 2 });
  for (const page of pages) {
    const counts = {};
    for (const t of page) counts[t.artist] = (counts[t.artist] || 0) + 1;
    for (const c of Object.values(counts)) assert.ok(c <= 2, `artist count ${c} > 2`);
  }
});

test('composeSpeedDial: relaxes artist cap to fill tiny / artist-concentrated library (case D)', () => {
  const pool = Array.from({ length: 5 }, (_, i) => track(i + 1, 'Only Artist'));
  const { pages, pageCount } = composeSpeedDial(pool, { maxPerPageArtist: 2 });
  assert.equal(pageCount, 1);
  assert.equal(pages[0].length, 5);
});

test('composeSpeedDial: no-op on a single track (case E)', () => {
  const { pages } = composeSpeedDial([track(1)]);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].length, 1);
});

// --- composeQuickPicks ---
test('composeQuickPicks: excludes all Speed Dial ids (case F)', () => {
  const pool = Array.from({ length: 30 }, (_, i) => track(i + 1));
  const dial = Array.from({ length: 20 }, (_, i) => i + 1);
  const qp = composeQuickPicks(pool, dial, { count: 8 });
  assert.equal(qp.length, 8);
  for (const t of qp) assert.ok(!dial.includes(Number(t.id)));
});

test('composeQuickPicks: no overlap invariant across surfaces (case G)', () => {
  const pool = Array.from({ length: 30 }, (_, i) => track(i + 1));
  const { pages } = composeSpeedDial(pool);
  const dialIds = pages.flat().map((t) => Number(t.id));
  const qp = composeQuickPicks(pool, dialIds, { count: 8 });
  const dial = new Set(dialIds);
  for (const t of qp) assert.ok(!dial.has(Number(t.id)));
});

test('composeQuickPicks: returns fewer when pool exhausted (case H)', () => {
  const pool = Array.from({ length: 3 }, (_, i) => track(i + 1));
  const qp = composeQuickPicks(pool, [], { count: 8 });
  assert.equal(qp.length, 3);
});

// --- composeRefreshWindow ---
test('composeRefreshWindow: deterministic rotation (case I)', () => {
  const pool = Array.from({ length: 10 }, (_, i) => track(i + 1));
  const a = composeRefreshWindow(pool, 0);
  const b = composeRefreshWindow(pool, 0);
  assert.deepEqual(a, b);
  const c = composeRefreshWindow(pool, 3);
  assert.notDeepEqual(a.pool.map((t) => t.id), c.pool.map((t) => t.id));
  // rotation preserves the full set of ids
  assert.deepEqual(pool.map((t) => t.id).sort((x, y) => x - y), c.pool.map((t) => t.id).sort((x, y) => x - y));
});

test('composeRefreshWindow: offset wraps mod pool length (case J)', () => {
  const pool = Array.from({ length: 5 }, (_, i) => track(i + 1));
  const a = composeRefreshWindow(pool, 0);
  const wrap = composeRefreshWindow(pool, 5);
  assert.deepEqual(a.pool.map((t) => t.id), wrap.pool.map((t) => t.id));
});

test('composeRefreshWindow: single track is stable (case K)', () => {
  const { pool, offset } = composeRefreshWindow([track(1)], 7);
  assert.equal(pool.length, 1);
  assert.equal(offset, 0);
});

test('composeSpeedDial: full compose integration (case L)', () => {
  const discovery = Array.from({ length: 10 }, (_, i) => track(100 + i, 'D' + (i % 3)));
  const familiar = Array.from({ length: 6 }, (_, i) => track(200 + i, 'F' + (i % 3), 'Jazz', { recommendation_count: 9 }));
  const recent = Array.from({ length: 4 }, (_, i) => track(300 + i, 'R' + (i % 3), 'Blues'));
  const pool = [...discovery, ...familiar, ...recent];
  const { pages } = composeSpeedDial(pool, {
    recentlyPlayedIds: recent.map((t) => t.id),
    favoriteIds: familiar.map((t) => t.id)
  });
  const all = pages.flat();
  const ids = all.map((t) => Number(t.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(all.length >= 9);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
