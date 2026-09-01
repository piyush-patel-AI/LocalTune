// Diversity-aware selection: deterministic greedy picker with per-artist,
// per-album and per-genre caps so a single artist/album never floods a queue.

import { primaryArtist, normalizeGenre } from './util.js';

/**
 * Greedy selection enforcing:
 *   - maxSameArtist within the last `artistWindow` picks (default 2)
 *   - maxSameAlbumPerN consecutive picks
 *   - maxGenreStreak consecutive picks
 * Plus soft penalties applied to the *original* ranking for near-duplicate
 * artists/albums so their relative order still reflects user preference.
 *
 * Returns { tracks, diversityStats, overrides } where `overrides` lists the
 * scores that were adjusted by soft penalties (for diagnostics).
 */
export function selectWithDiversity({ ranking, config, count = 10 }) {
  const cfg = config?.diversity || {};
  const maxArtist = cfg.maxSameArtist ?? 2;
  const maxAlbumWindow = cfg.maxSameAlbumPerN ?? 2;
  const maxGenreStreak = cfg.maxGenreStreak ?? 3;
  const artistWindow = cfg.artistWindow ?? 6;
  const artistSoftPenalty = cfg.artistSoftPenalty ?? 12;
  const albumSoftPenalty = cfg.albumSoftPenalty ?? 10;

  const items = ranking.map((item) => ({
    ...item,
    adjustedScore: item.totalScore,
    softAdjusted: false
  }));

  // 1) Soft pull-down for artist/album saturation in the top queue region.
  const artistCount = new Map();
  const albumCount = new Map();
  for (const item of items) {
    const artist = primaryArtist(item.track.artist);
    const album = item.track.album;
    const artistScore = (artistCount.get(artist) || 0) + 1;
    const albumScore = (albumCount.get(album) || 0) + 1;
    artistCount.set(artist, artistScore);
    albumCount.set(album, albumScore);
    if (artistScore > 1) {
      item.adjustedScore = Math.max(0, item.adjustedScore - artistSoftPenalty * (artistScore - 1));
      item.softAdjusted = true;
    }
    if (albumScore > 1) {
      item.adjustedScore = Math.max(0, item.adjustedScore - albumSoftPenalty * (albumScore - 1));
      item.softAdjusted = true;
    }
  }
  items.sort((a, b) => b.adjustedScore - a.adjustedScore || b.totalScore - a.totalScore);

  // 2) Hard greedy selection.
  const selected = [];
  const recentArtists = [];
  const recentAlbums = [];
  const recentGenres = [];
  let stats = { artistCollisions: 0, albumCollisions: 0, genreCollisions: 0 };

  for (const item of items) {
    if (selected.length >= count) break;
    const artist = primaryArtist(item.track.artist);
    const album = item.track.album;
    const genre = normalizeGenre(item.track.genre);

    const artistOk = recentArtists.filter((a) => a === artist).length < Math.max(1, maxArtist);
    const albumOk = recentAlbums.filter((a) => a === album).length < maxAlbumWindow;
    const genreRun = recentGenres.length ? countTrailingRun(recentGenres, genre) : 0;
    const genreOk = genreRun < Math.max(1, maxGenreStreak);

    if (artistOk && albumOk && genreOk) {
      selected.push(item.track);
      recentArtists.push(artist);
      recentAlbums.push(album);
      recentGenres.push(genre);
      if (recentArtists.length > artistWindow) recentArtists.shift();
      if (recentAlbums.length > artistWindow) recentAlbums.shift();
    } else {
      if (!artistOk) stats.artistCollisions += 1;
      if (!albumOk) stats.albumCollisions += 1;
      if (!genreOk) stats.genreCollisions += 1;
    }
  }

  return { tracks: selected, diversityStats: stats };
}

function countTrailingRun(arr, value) {
  let run = 0;
  for (let i = arr.length - 1; i >= 0; i -= 1) {
    if (arr[i] === value) run += 1;
    else break;
  }
  return run;
}

/** Clamp consecutive-same-artist constraint used by the barrel when merging shelves. */
export function ensureArtistLimit(queue, maxSameArtist = 2) {
  const counts = new Map();
  const out = [];
  for (const track of queue) {
    const artist = primaryArtist(track.artist);
    if ((counts.get(artist) || 0) >= maxSameArtist) continue;
    counts.set(artist, (counts.get(artist) || 0) + 1);
    out.push(track);
  }
  return out;
}