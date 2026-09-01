// Multi-source candidate retrieval. Merges candidates from six deterministic
// sources (current-track matching, session affinity, transitions, long-term
// taste, discovery, and a small deterministic exploration pool), tags each
// candidate with its origin sources, and down-selects to a bounded pool.

import { parseArtists, primaryArtist, normalizeGenre, safeInt } from './util.js';
import { artistAffinityOf, genreAffinityOf } from './userProfile.js';
import { discoveryValueFor } from './discovery.js';

export function gatherCandidates({ ctx, currentTrackId = null, poolSize = null }) {
  const cfg = ctx.config.retrieval || {};
  const sourceWeights = cfg.sourceWeights || {};
  const limit = poolSize || cfg.candidateLimit || 120;
  const currentTrack = currentTrackId ? ctx.tracksById?.get(Number(currentTrackId)) || null : null;

  const pool = new Map(); // trackId -> { track, sources:Set<string> }
  const add = (track, source) => {
    if (!track) return;
    const id = Number(track.id);
    let entry = pool.get(id);
    if (!entry) {
      entry = { track, sources: new Set() };
      pool.set(id, entry);
    }
    entry.sources.add(source);
  };

  // 1) Current-track matching (artist/album/genre proximity).
  if (currentTrack) {
    const bucket = cfg.currentTrack || {};
    for (const track of ctx.allTracks) {
      if (Number(track.id) === Number(currentTrack.id)) continue;
      const sameArtist = parseArtists(track.artist).some((a) => parseArtists(currentTrack.artist).includes(a));
      const sameAlbum = track.album && currentTrack.album && String(track.album).toLowerCase() === String(currentTrack.album).toLowerCase();
      const sameGenre = normalizeGenre(track.genre) === normalizeGenre(currentTrack.genre);
      if (sameArtist || sameAlbum || sameGenre) add(track, 'currentTrack');
    }
  }

  // 2) Session affinity (top artists/genres of the current listening session).
  const sessionTopArtists = topKeys(ctx.sessionCtx.sessionArtistCounts, 4);
  const sessionTopGenres = topKeys(ctx.sessionCtx.sessionGenreCounts, 4, true);
  for (const track of ctx.allTracks) {
    const artists = parseArtists(track.artist);
    const genre = normalizeGenre(track.genre);
    if (artists.some((a) => sessionTopArtists.has(a)) || sessionTopGenres.has(genre)) {
      add(track, 'sessionAffinity');
    }
  }

  // 3) Transitions from the current track (calibrated P(next | current)).
  if (currentTrack) {
    for (const { toId } of ctx.transitionModel.choices(Number(currentTrack.id))) {
      const track = ctx.tracksById?.get(toId);
      if (track) add(track, 'transition');
    }
  }

  // 4) Long-term taste (from the 90-day genre/artist profile).
  const lta = profileTasteKeys(ctx, 'artist', 6);
  const ltg = profileTasteKeys(ctx, 'genre', 6);
  for (const track of ctx.allTracks) {
    const artists = parseArtists(track.artist);
    const genre = normalizeGenre(track.genre);
    if (artists.some((a) => lta.has(a)) || ltg.has(genre)) add(track, 'longTermTaste');
  }

  // 5) Discovery: never/rarely-played this library anchors on user taste.
  for (const { track } of selectDiscoveryCandidatesInternal(ctx)) {
    add(track, 'discovery');
  }

  // 6) Exploration: small deterministic pool of decent tracks untouched by any
  //    other source (breaks echo chambers without introducing randomness).
  const qualityFloor = cfg.exploration?.qualityFloor ?? 0.4;
  const maxExploration = cfg.exploration?.maxPoolSize ?? 15;
  const untouched = ctx.allTracks
    .filter((track) => !pool.has(Number(track.id)) && qualityOk(track, qualityFloor))
    .sort((a, b) => hashKey(`${ctx.userId}:${Number(a.id)}`) - hashKey(`${ctx.userId}:${Number(b.id)}`))
    .slice(0, maxExploration);
  for (const track of untouched) add(track, 'exploration');

  // Down-select deterministically: strength = sum of source weights + taste.
  const entries = [...pool.values()];
  entries.sort((a, b) => strength(ctx, b, sourceWeights) - strength(ctx, a, sourceWeights) || a.track.id - b.track.id);
  const selected = entries.slice(0, limit);

  const meta = {};
  for (const entry of entries) {
    for (const source of entry.sources) {
      meta[source] = (meta[source] || 0) + 1;
    }
  }

  return {
    pool: selected.map((e) => ({ track: e.track, sources: [...e.sources] })),
    byId: new Map(selected.map((e) => [Number(e.track.id), e.track])),
    meta: { totalPool: entries.length, selected: selected.length, counts: meta }
  };
}

function strength(ctx, entry, sourceWeights) {
  let s = 0;
  for (const source of entry.sources) s += sourceWeights[source] || 0;
  s += artistAffinityOf(ctx.profile, primaryArtist(entry.track.artist)) * 0.2;
  s += genreAffinityOf(ctx.profile, entry.track.genre) * 0.2;
  s += discoveryValueFor(entry.track, ctx) * 0.1;
  return s;
}

function topKeys(counts, n, lower = false) {
  const entries = Object.entries(counts || {});
  const set = new Set();
  entries
    .map(([k, v]) => [lower ? k.toLowerCase() : k, v])
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .slice(0, n)
    .forEach(([k]) => set.add(k));
  return set;
}

function profileTasteKeys(ctx, kind, n) {
  const weights = kind === 'artist'
    ? ctx.profile?.windows?.longTerm?.artistWeights
    : ctx.profile?.windows?.longTerm?.genreWeights;
  const set = new Set();
  if (!weights) return set;
  [...weights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .forEach(([k]) => set.add(kind === 'genre' ? String(k).toLowerCase() : k));
  return set;
}

function selectDiscoveryCandidatesInternal(ctx) {
  const cfg = ctx.config.retrieval?.discovery || {};
  const out = [];
  for (const track of ctx.allTracks) {
    const playedCount = ctx.playLogMap?.get(Number(track.id))?.length || 0;
    if (playedCount > 2) continue;
    const genreA = genreAffinityOf(ctx.profile, track.genre);
    const artistA = artistAffinityOf(ctx.profile, primaryArtist(track.artist));
    const anchored = Math.max(artistA, genreA) >= (cfg.minGenreAffinity ?? 2.0) / 20;
    if (!anchored) continue;
    out.push({ track, playedCount, affinity: genreA });
  }
  out.sort((a, b) =>
    a.playedCount - b.playedCount || b.affinity - a.affinity || Number(a.track.id) - Number(b.track.id));
  return out;
}

function qualityOk(track, floor) {
  const duration = Number(track.duration_seconds) || 0;
  return duration >= 30 && duration <= 7200 && !!track.title && !!track.artist;
}

/** Deterministic 32-bit hash (FNV-1a) for stable pseudo-random exploration order. */
function hashKey(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}