// Pure, framework-free helpers that turn the flat V2 recommendation list into
// the Home shelf surfaces: Speed Dial (recommendation-first, quota-mixed,
// artist-diverse, paginated) and Quick Picks (a distinct, deduped surface).
//
// These functions never mutate their inputs and never touch the DOM or React,
// so they are trivial to unit test with plain node.

export const DEFAULT_QUOTAS = { discovery: 5, familiar: 2, recent: 2 };
export const DEFAULT_PER_PAGE = 9;
export const DEFAULT_MAX_PER_PAGE_ARTIST = 2;

const HIGH_RECOMMENDATION_COUNT = 5;

// What makes a track count as "recent-continuity" vs "familiar" vs "discovery".
// Uses only data the mobile client already has: the current track's recent
// history (recentlyPlayedIds), the favorites map, the per-track
// recommendation_count / last_recommended_at, and the V2 `reason`.
export function classifyTrack(track, { recentlyPlayedIds = [], favoriteIds = [] } = {}) {
  const id = track && Number(track.id);
  if (recentlyPlayedIds.includes(id)) return 'recent';
  if (favoriteIds.includes(id)) return 'familiar';
  const recCount = track && (Number(track.recommendation_count) || 0);
  if (recCount >= HIGH_RECOMMENDATION_COUNT) return 'familiar';
  const reason = ((track && track.reason) || '').toLowerCase();
  if (/never played|hidden gem|discover|fresh|new/i.test(reason)) return 'discovery';
  return 'discovery';
}

function artistOf(track) {
  return (track && track.artist) || 'Unknown';
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((t) => {
    if (!t || t.id == null || seen.has(Number(t.id))) return false;
    seen.add(Number(t.id));
    return true;
  });
}

// Total pages for a 3x3 layout given the number of tracks. Dynamic:
//   0 -> 0, 1-9 -> 1, 10-18 -> 2, 19-27 -> 3
export function pageCountFor(total, perPage = DEFAULT_PER_PAGE) {
  if (!total || total <= 0) return 0;
  return Math.min(3, Math.ceil(total / perPage));
}

function collectPages(tracks, perPage) {
  const pages = [];
  for (let i = 0; i < tracks.length; i += perPage) {
    pages.push(tracks.slice(i, i + perPage));
  }
  return pages;
}

/**
 * Compose the Speed Dial surfaces from the flat V2 recommendation pool.
 *
 * The pool is already backend-ranked (higher score = stronger recommendation).
 * We classify each track into a lane (discovery / familiar / recent), honor the
 * per-page quotas, enforce a per-page artist cap, and paginate dynamically.
 *
 * Returns { pages, pageCount, placement } where `pages` is an array of
 * per-page track arrays (9 per page by default) and `placement` maps each
 * placed track id -> 'discovery' | 'familiar' | 'recent'.
 */
export function composeSpeedDial(
  pool,
  {
    recentlyPlayedIds = [],
    favoriteIds = [],
    quotas = DEFAULT_QUOTAS,
    perPage = DEFAULT_PER_PAGE,
    maxPerPageArtist = DEFAULT_MAX_PER_PAGE_ARTIST
  } = {}
) {
  const deduped = dedupe(pool);
  const pageTrackCount = perPage;

  const totalPages = pageCountFor(deduped.length, perPage);
  const placed = [];
  const placement = new Map();
  const baseCap = maxPerPageArtist > 0 ? maxPerPageArtist : Math.ceil(pageTrackCount / 3);

  // Remaining tracks carry their lane classification; we splice from this list
  // as tracks get placed so each track appears exactly once across all pages.
  const take = (item, counts, page, laneCounts) => {
    if (!remaining.includes(item)) return;
    remaining.splice(remaining.indexOf(item), 1);
    page.push(item);
    const a = artistOf(item.track);
    counts.set(a, (counts.get(a) || 0) + 1);
    laneCounts[item.lane] += 1;
  };

  const remaining = deduped.map((t) => ({
    track: t,
    lane: classifyTrack(t, { recentlyPlayedIds, favoriteIds })
  }));

  for (let p = 0; p < totalPages; p++) {
    const page = [];
    const counts = new Map();
    const laneCounts = { discovery: 0, familiar: 0, recent: 0 };

    // Relax the artist cap progressively when a page cannot fill because too
    // few distinct artists remain in the pool.
    let cap = baseCap;
    const needTotal = pageTrackCount;

    while (page.length < needTotal) {
      // Pass 1: try to honor the per-lane quotas.
      for (const laneName of ['discovery', 'familiar', 'recent']) {
        const quota = quotas[laneName] || 0;
        if (laneCounts[laneName] >= quota || quota <= 0) continue;
        for (const item of remaining) {
          if (page.length >= needTotal) break;
          if (item.lane !== laneName) continue;
          if ((counts.get(artistOf(item.track)) || 0) >= cap) continue;
          take(item, counts, page, laneCounts);
          if (laneCounts[laneName] >= quota) break;
        }
      }

      // Pass 2: backfill the remaining slots from any lane (quota-agnostic).
      for (const item of remaining) {
        if (page.length >= needTotal) break;
        if ((counts.get(artistOf(item.track)) || 0) >= cap) continue;
        take(item, counts, page, laneCounts);
      }

      // Relax the artist cap for the next attempt if we still have slots left.
      // The cap never needs to exceed the page size, and we stop early when the
      // pool is exhausted.
      if (page.length < needTotal) {
        if (remaining.length === 0) break;
        cap += 1;
        if (cap > needTotal) break;
      }
    }

    for (const item of page) {
      placement.set(Number(item.track.id), item.lane);
      placed.push(item.track);
    }
  }

  const pages = collectPages(placed, perPage);

  return {
    pages,
    pageCount: pages.length,
    placement: Object.fromEntries(placement)
  };
}

/**
 * Compose the Quick Picks surface. It is distinct from Speed Dial: it
 * explicitly EXCLUDES every track already placed on Speed Dial (hard dedupe
 * across surfaces) and takes the next pool tracks by rank order.
 */
export function composeQuickPicks(pool, speedDialIds = [], { count = 8 } = {}) {
  const dial = new Set((speedDialIds || []).map((id) => Number(id)));
  const picked = [];
  for (const track of dedupe(pool)) {
    if (picked.length >= count) break;
    if (!track || dial.has(Number(track.id))) continue;
    picked.push(track);
  }
  return picked;
}

/**
 * Deterministic pool-window offset for the Speed Dial refresh button.
 *
 * The backend `/api/tracks/recommendations` endpoint returns a cached array
 * (no exploration endpoint, no randomization allowed). To give a refresh a
 * sense of rotation WITHOUT fabricating tracks or touching the backend, we
 * rotate a start offset into the ranked pool and re-run composition. Each
 * distinct offset yields a deterministic, reproducible arrangement.
 */
export function composeRefreshWindow(pool, baseOffset = 0) {
  const arr = dedupe(pool);
  if (arr.length <= 1) return { pool: arr, offset: 0 };
  const n = arr.length;
  const offset = ((baseOffset % n) + n) % n;
  const windowed = [...arr.slice(offset), ...arr.slice(0, offset)];
  return { pool: windowed, offset };
}
