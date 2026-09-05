/**
 * Surface-specific recommendation composition and client-side filtering engine for LocalTune Mobile V3.
 * Preserves server recommendation ranking while applying surface constraints (3x3 Speed Dial, Quick Picks).
 */

/**
 * Classifies candidate tracks into discovery, familiar, and recent categories.
 */
export function classifyCandidates({ candidatePool, favoritesMap = {}, listenHistory = [] }) {
  const recentTrackIds = new Set(listenHistory.slice(-20).map((t) => (typeof t === 'number' ? t : t.id)));
  const discovery = [];
  const familiar = [];
  const recent = [];

  for (const track of candidatePool) {
    const isFav = !!favoritesMap[track.id];
    const isRecent = recentTrackIds.has(track.id);

    if (isRecent) {
      recent.push(track);
    } else if (isFav || track.play_count > 5) {
      familiar.push(track);
    } else {
      discovery.push(track);
    }
  }

  return { discovery, familiar, recent };
}

/**
 * Builds swipeable pages for Speed Dial (3x3 grid = 9 tracks per page).
 * Target composition per 9-track page: 5 discovery, 2 familiar, 2 recent.
 * Enforces max 2 tracks per artist per page.
 * Deduplicates tracks across pages.
 */
export function buildSpeedDialPages({
  candidatePool = [],
  favoritesMap = {},
  listenHistory = [],
  pageCount = 3,
  pageSize = 9,
  pageOffset = 0,
}) {
  if (!candidatePool || candidatePool.length === 0) return [];

  // Deterministic candidate window shift based on pageOffset
  const windowShift = (pageOffset * 3) % Math.max(1, candidatePool.length);
  const shiftedPool = [
    ...candidatePool.slice(windowShift),
    ...candidatePool.slice(0, windowShift),
  ];

  const { discovery, familiar, recent } = classifyCandidates({
    candidatePool: shiftedPool,
    favoritesMap,
    listenHistory,
  });

  const usedTrackIds = new Set();
  const pages = [];

  // Helper pools to pull from
  let discIndex = 0;
  let famIndex = 0;
  let recIndex = 0;
  let fallbackIndex = 0;

  for (let p = 0; p < pageCount; p++) {
    const pageTracks = [];
    const artistCounts = new Map();

    const canAddTrack = (track) => {
      if (!track || usedTrackIds.has(track.id)) return false;
      const artist = (track.artist || 'Unknown').toLowerCase();
      const currentArtistCount = artistCounts.get(artist) || 0;
      // Max 2 tracks per artist unless forced by small candidate pool
      return currentArtistCount < 2;
    };

    const addTrack = (track) => {
      pageTracks.push(track);
      usedTrackIds.add(track.id);
      const artist = (track.artist || 'Unknown').toLowerCase();
      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    };

    // Target quotas: 5 discovery, 2 familiar, 2 recent
    const targets = [
      { pool: discovery, getIdx: () => discIndex, setIdx: (i) => (discIndex = i), quota: 5 },
      { pool: familiar, getIdx: () => famIndex, setIdx: (i) => (famIndex = i), quota: 2 },
      { pool: recent, getIdx: () => recIndex, setIdx: (i) => (recIndex = i), quota: 2 },
    ];

    // Attempt to satisfy quotas
    for (const target of targets) {
      let addedForTarget = 0;
      let i = target.getIdx();
      while (i < target.pool.length && addedForTarget < target.quota && pageTracks.length < pageSize) {
        const trk = target.pool[i];
        i++;
        if (canAddTrack(trk)) {
          addTrack(trk);
          addedForTarget++;
        }
      }
      target.setIdx(i);
    }

    // Fill remaining slots in page from candidate pool if quotas were unfilled or artist restrictions blocked items
    let poolIdx = fallbackIndex;
    while (pageTracks.length < pageSize && poolIdx < shiftedPool.length) {
      const trk = shiftedPool[poolIdx];
      poolIdx++;
      if (canAddTrack(trk)) {
        addTrack(trk);
      }
    }
    fallbackIndex = poolIdx;

    // Second pass relaxation if artist restrictions blocked filling up to available pool
    if (pageTracks.length < pageSize) {
      for (const trk of shiftedPool) {
        if (pageTracks.length >= pageSize) break;
        if (!usedTrackIds.has(trk.id)) {
          addTrack(trk);
        }
      }
    }

    if (pageTracks.length > 0) {
      pages.push(pageTracks);
    }
  }

  return pages;
}

/**
 * Builds Quick Picks surface items.
 * Must be recommendation-driven, distinct from Speed Dial track IDs, and deduplicated.
 */
export function buildQuickPicks({
  candidatePool = [],
  speedDialTrackIds = new Set(),
  limit = 8,
}) {
  if (!candidatePool || candidatePool.length === 0) return [];

  const quickPicks = [];
  const usedIds = new Set();

  // First pass: select candidate tracks not in Speed Dial
  for (const track of candidatePool) {
    if (quickPicks.length >= limit) break;
    if (!speedDialTrackIds.has(track.id) && !usedIds.has(track.id)) {
      quickPicks.push(track);
      usedIds.add(track.id);
    }
  }

  // Second pass: if candidate pool was small, include Speed Dial tracks if necessary to maintain visibility
  if (quickPicks.length < limit) {
    for (const track of candidatePool) {
      if (quickPicks.length >= limit) break;
      if (!usedIds.has(track.id)) {
        quickPicks.push(track);
        usedIds.add(track.id);
      }
    }
  }

  return quickPicks;
}
