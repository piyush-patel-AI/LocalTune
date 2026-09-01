// Discovery budget: determines how aggressively to surface never/rarely-played
// tracks, adapting up when the user completes a lot and down when they skip.
//
// Non-random: budget ratios are config-driven and the candidate selections are
// deterministic given the same listening history.

import { toTimestamp, clamp } from './util.js';
import { artistAffinityOf, genreAffinityOf } from './userProfile.js';

const MS_DAY = 86400000;
const MS_30_DAYS = 30 * MS_DAY;

/**
 * Adaptive discovery factor in [shrinkMin, boostMax], derived purely from the
 * user's own session engagement so heavy-engagement users see more new music.
 */
export function computeDiscoveryBudget(ctx) {
  const cfg = ctx.config.discovery?.adaptive || {};
  const completion = ctx.sessionCtx?.averageCompletion ?? 0.5;
  const skipRate = ctx.sessionCtx?.skipRate ?? 0;
  const started = cfg.completionThreshold ?? 0.5;
  const skipCap = cfg.skipRateThreshold ?? 0.35;
  const boostMax = cfg.discoveryBoostMax ?? 1.5;
  const shrinkMin = cfg.discoveryShrinkMin ?? 0.5;

  const completionLean = clamp((completion - started) / 0.5, -1, 1);
  const skipLean = clamp((skipCap - skipRate) / 0.35, -1, 1);
  const factor = 1 + 0.5 * completionLean + 0.5 * skipLean;
  return clamp(factor, shrinkMin, boostMax);
}

export function discoveryValueFor(track, ctx) {
  const playLogs = (ctx.playLogMap?.get(Number(track.id))) || [];
  const played = playLogs.length;
  if (played === 0) return 1.0;
  if (played === 1) return 0.75;
  if (played === 2) return 0.5;
  return 0.15;
}

/**
 * Bucket discovery candidates by exposure tier. Only tracks whose artist/genre
 * has a minimum affinity floor are admitted so the library stays taste-anchored.
 */
export function selectDiscoveryCandidates({ ctx, limit = null }) {
  const cfg = ctx.config.retrieval?.discovery || {};
  const minGenre = cfg.minGenreAffinity ?? 2.0;
  const floor = minGenre / 20; // affinity is 0..1; config expresses in "plays" units
  const discovered = [];
  const never = [];
  const rarely = [];

  for (const track of ctx.allTracks) {
    const id = Number(track.id);
    const playedCount = ctx.playLogMap?.get(id)?.length || 0;
    if (playedCount > 2) continue;
    const artistScore = affinityFor(ctx, 'artist', track.artist);
    const genreScore = affinityFor(ctx, 'genre', track.genre);
    const anchored = Math.max(artistScore, genreScore) >= floor;
    if (!anchored) continue;
    const item = { track, playedCount, artistScore, genreScore, discoveryValue: playedCount === 0 ? 1 : 0.75 };
    if (playedCount === 0) never.push(item);
    else rarely.push(item);
  }

  const budget = ctx.config.retrieval?.discovery || {};
  const neverCap = budget.maxNeverPlayed ?? 20;
  const rarelyCap = budget.maxRarelyPlayed ?? 20;
  never.sort((a, b) => b.genreScore - a.genreScore || a.track.title.localeCompare(b.track.title));
  rarely.sort((a, b) => b.discoveryValue - a.discoveryValue || b.genreScore - a.genreScore);
  discovered.push(...never.slice(0, neverCap), ...rarely.slice(0, rarelyCap));
  return discovered;
}

/** Rarely/freshly-played favorites for the "hidden gems" style shelves. */
export function selectRareGems({ ctx, minPlays = 1, maxPlays = 8, limit = 10 }) {
  return ctx.allTracks
    .map((track) => ({ track, playedCount: ctx.playLogMap?.get(Number(track.id))?.length || 0 }))
    .filter((x) => x.playedCount >= minPlays && x.playedCount <= maxPlays)
    .sort((a, b) => a.playedCount - b.playedCount || a.track.title.localeCompare(b.track.title))
    .slice(0, limit)
    .map((x) => x.track);
}

/** Forgotten favorites: favorited or heavily-played, untouched for weeks. */
export function selectForgottenFavorites({ ctx, forgottenDays = 30, limit = 10, minPlaysForHeavy = 3 }) {
  const now = Date.now();
  const forgottenMs = forgottenDays * MS_DAY;
  const out = [];
  for (const track of ctx.allTracks) {
    const favorite = ctx.favoritesMap && (ctx.favoritesMap[track.id] || ctx.favoritesMap[Number(track.id)]);
    const logs = ctx.playLogMap?.get(Number(track.id)) || [];
    const heavy = logs.length >= minPlaysForHeavy;
    if (!favorite && !heavy) continue;
    const lastPlayedMs = logs.length ? toTimestamp(logs[0].timestamp) : 0;
    if (logs.length === 0 && favorite) {
      out.push(track); // favorited but never played
      continue;
    }
    if (logs.length > 0 && now - lastPlayedMs >= forgottenMs) out.push(track);
  }
  return out.slice(0, limit);
}

function affinityFor(ctx, kind, value) {
  if (kind === 'artist') {
    return artistAffinityOf(ctx.profile, value);
  }
  return genreAffinityOf(ctx.profile, value);
}

/** Recently-added library tracks for the freshness shelf. */
export function selectRecentlyAdded({ ctx, limit = 10 }) {
  return [...ctx.allTracks]
    .sort((a, b) => {
      const at = toTimestamp(b.date_added || b.date_modified);
      const bt = toTimestamp(a.date_added || a.date_modified);
      return at - bt;
    })
    .slice(0, limit);
}

export { MS_30_DAYS };