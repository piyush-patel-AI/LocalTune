// Octave Recommendation V2 - public engine surface.
//
// Keeps the V1 API contract (scoreTracks, generateRecommendations,
// generateDiscoveryRadar, generateForgottenFavorites, generateAutoplayTracks,
// generateShelves, invalidateRecommendationCache, loadRecommendationConfig) so
// routes, clients and legacy tests keep working unchanged while the internals
// run the multi-stage V2 pipeline.

import { loadRecommendationConfig } from './config.js';
import { buildPipelineContext, invalidateRecommendationCache as baseInvalidate } from './cache.js';
import { rankCandidates } from './rank.js';
import { gatherCandidates } from './retrieval.js';
import { applyHardFilters, applyRecommendationCooldown } from './antiRepetition.js';
import { selectWithDiversity } from './diversity.js';
import {
  computeDiscoveryBudget,
  selectDiscoveryCandidates,
  selectForgottenFavorites,
  selectRareGems,
  selectRecentlyAdded
} from './discovery.js';
import * as v1Engine from './legacy/v1Engine.js';

export { loadRecommendationConfig };
export const legacy = v1Engine;

// Result-level cache mirroring V1 semantics: identical (user, currentTrack)
// calls return the exact same array reference until invalidated.
const resultCache = new Map();

function onInvalidation(userId) {
  if (userId) {
    for (const key of [...resultCache.keys()]) {
      if (key === `${userId}_` || key.startsWith(`${userId}_`) || key.startsWith(`rec_${userId}_`)) {
        resultCache.delete(key);
      }
    }
  } else {
    resultCache.clear();
  }
}

/** Event-driven invalidation for both the context cache and the result cache. */
export function invalidateRecommendationCache(userId) {
  baseInvalidate(userId);
  onInvalidation(userId);
}

function attachScore(track, rankedItem) {
  return {
    ...track,
    score: rankedItem?.totalScore ?? 0,
    reason: rankedItem?.reason || '',
    scoreBreakdown: rankedItem?.breakdown || {}
  };
}

function mapRankedById(ranked) {
  return new Map(ranked.map((r) => [Number(r.track.id), r]));
}

async function rankedAll(ctx, currentTrackId) {
  return rankCandidates({ candidates: ctx.allTracks, ctx, currentTrackId: currentTrackId ?? ctx.currentTrackId });
}

/** Score every track in the library (same shape/order as V1). */
export async function scoreTracks({ allTracks, favoritesMap = {}, userId, currentTrackId }) {
  const ctx = await buildPipelineContext({ allTracks, favoritesMap, userId, currentTrackId });
  const ranked = await rankedAll(ctx, currentTrackId);
  const byId = mapRankedById(ranked);
  return ctx.allTracks.map((track) => {
    const item = byId.get(Number(track.id));
    return {
      track: attachScore(track, item),
      totalScore: item?.totalScore ?? 0,
      logs: ctx.playLogMap.get(Number(track.id)) || []
    };
  });
}

async function logImpressions(ctx, tracks, surface) {
  if (!ctx.config?.telemetry?.impressionLogging || !tracks?.length) return;
  const version = ctx.config.algorithmVersion || 'v2';
  await Promise.all(tracks.map((track, i) =>
    ctx.db.logRecommendationAction({
      userId: ctx.userId,
      trackId: Number(track.id),
      shelfId: surface,
      action: 'shown',
      algorithmVersion: version,
      source: surface,
      surface,
      currentTrackId: ctx.currentTrackId,
      positionInQueue: i
    }).catch(() => {})
  ));
}

function stamped(selected, byId) {
  return selected.map((track) => attachScore(track, byId.get(Number(track.id))));
}

async function buildCtx(args) {
  return buildPipelineContext(args);
}

/** Generate the main "Recommended For You" shelf. */
export async function generateRecommendations({
  allTracks,
  favoritesMap = {},
  userId,
  currentTrackId,
  count = 20,
  queueTrackIds = []
}) {
  const ctx = await buildCtx({ allTracks, favoritesMap, userId, currentTrackId });
  const curId = ctx.currentTrackId;
  const cacheKey = `rec_${ctx.userId}_${curId || 'none'}_${count}`;
  if (resultCache.has(cacheKey)) return resultCache.get(cacheKey);

  const filtered = applyHardFilters({
    candidates: ctx.allTracks,
    ctx,
    currentTrackId: curId,
    excludeTrackIds: queueTrackIds
  });

  // Retrieval down-select first so ranking rides a bounded candidate pool at
  // large-library scale (small libraries keep everything).
  const retrieval = gatherCandidates({ ctx, currentTrackId: curId });
  const poolIds = retrieval.byId;
  const pool = filtered.length <= 30 ? filtered : filtered.filter((t) => poolIds.has(Number(t.id)));

  const ranked = applyRecommendationCooldown(
    rankCandidates({ candidates: pool, ctx, currentTrackId: curId }),
    ctx
  );

  const { tracks, diversityStats } = selectWithDiversity({ ranking: ranked, config: ctx.config, count });
  const selected = [...tracks];
  const seen = new Set(selected.map((t) => Number(t.id)));
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (!seen.has(Number(item.track.id))) {
      selected.push(item.track);
      seen.add(Number(item.track.id));
    }
  }

  const result = stamped(selected.slice(0, count), mapRankedById(ranked));
  result.meta = { strategy: 'v2', retrieval: retrieval.meta, diversityStats, source: 'recommended' };

  // Telemetry: stamp last_recommended_at + emit 'shown' impressions for outcome
  // attribution when the client later plays/completes/skips these.
  await Promise.all(selected.map((t) => ctx.db.updateRecommendationStats(Number(t.id)))).catch(() => {});
  await logImpressions(ctx, selected, 'recommended').catch(() => {});

  resultCache.set(cacheKey, result);
  return result;
}

/** Discovery Radar shelf: freshest never/rarely-played tracks matching taste. */
export async function generateDiscoveryRadar({ allTracks, favoritesMap = {}, userId, count = 10 }) {
  const ctx = await buildCtx({ allTracks, favoritesMap, userId });
  const ranked = await rankedAll(ctx, null);
  const pool = ranked.filter((item) => (ctx.playLogMap.get(Number(item.track.id)) || []).length <= 1);
  const cooldowned = applyRecommendationCooldown(pool, ctx);
  const byId = mapRankedById(ranked);

  const result = cooldowned.slice(0, count).map((item) => {
    const attached = attachScore(item.track, item);
    const playCount = ctx.playLogMap.get(Number(item.track.id))?.length || 0;
    attached.reason = playCount === 0
      ? "You've never played this track"
      : 'Discover new tracks from your favorite genres';
    return attached;
  });
  result.meta = { strategy: 'v2', source: 'radar' };
  await logImpressions(ctx, result, 'radar').catch(() => {});
  return result;
}

/** Forgotten Favorites shelf: favorites / heavily-played, untouched for weeks. */
export async function generateForgottenFavorites({ allTracks, favoritesMap = {}, userId, count = 10 }) {
  const ctx = await buildCtx({ allTracks, favoritesMap, userId });
  const rankedMap = mapRankedById(await rankedAll(ctx, null));
  const forgotten = selectForgottenFavorites({ ctx, forgottenDays: 30, limit: count });
  return forgotten
    .sort((a, b) => (rankedMap.get(Number(b.id))?.totalScore || 0) - (rankedMap.get(Number(a.id))?.totalScore || 0) || a.id - b.id)
    .slice(0, count)
    .map((track) => ({ ...attachScore(track, rankedMap.get(Number(track.id))), reason: 'One of your forgotten favorites' }));
}

/** Endless Autoplay: contextual queue when the current queue runs out. */
export async function generateAutoplayTracks({
  allTracks,
  favoritesMap = {},
  userId,
  currentTrackId,
  excludeTrackIds = [],
  count = 5
}) {
  const ctx = await buildCtx({ allTracks, favoritesMap, userId, currentTrackId });
  const filtered = applyHardFilters({
    candidates: ctx.allTracks,
    ctx,
    currentTrackId: ctx.currentTrackId,
    excludeTrackIds,
    lastPlayedExclusionMs: 2 * 60000
  });
  const ranked = rankCandidates({ candidates: filtered, ctx, currentTrackId: ctx.currentTrackId });
  const { tracks, diversityStats } = selectWithDiversity({ ranking: ranked, config: ctx.config, count });
  const selected = [...tracks];
  const seen = new Set(selected.map((t) => Number(t.id)));
  for (const item of ranked) {
    if (selected.length >= count) break;
    if (!seen.has(Number(item.track.id))) {
      selected.push(item.track);
      seen.add(Number(item.track.id));
    }
  }
  const result = stamped(selected.slice(0, count), mapRankedById(ranked));
  result.meta = { strategy: 'v2', diversityStats, source: 'autoplay' };
  await logImpressions(ctx, result, 'autoplay').catch(() => {});
  return result;
}

/** Unified shelves: single ranking pass shared by all shelves (+ Artist Radio). */
export async function generateShelves({ allTracks, favoritesMap = {}, userId, currentTrackId }) {
  const ctx = await buildCtx({ allTracks, favoritesMap, userId, currentTrackId });
  const ranked = await rankedAll(ctx, currentTrackId);
  const byId = mapRankedById(ranked);
  const rankOf = (trackId) => byId.get(Number(trackId))?.totalScore || 0;

  // 1. Continue Listening (recently listened with meaningful completion).
  const continueListening = ctx.allTracks
    .filter((t) => {
      const logs = ctx.playLogMap.get(Number(t.id)) || [];
      return logs.length > 0 && Number(logs[0].completion_ratio) >= 0.4;
    })
    .sort((a, b) => {
      const at = ctx.playLogMap.get(Number(a.id))?.[0]?.timestamp || 0;
      const bt = ctx.playLogMap.get(Number(b.id))?.[0]?.timestamp || 0;
      return new Date(bt) - new Date(at);
    })
    .slice(0, 8);

  // 2-6. Dedicated shelves (radar/forgotten reuse the shared ranking above).
  const [recommended, discoveryRadar, forgottenFavorites] = await Promise.all([
    generateRecommendations({ allTracks, favoritesMap, userId, currentTrackId, count: 12 }),
    generateDiscoveryRadar({ allTracks, favoritesMap, userId, count: 8 }),
    generateForgottenFavorites({ allTracks, favoritesMap, userId, count: 8 })
  ]);

  const hiddenGems = selectRareGems({ ctx, minPlays: 1, maxPlays: 8, limit: 20 })
    .sort((a, b) => rankOf(b.id) - rankOf(a.id) || a.id - b.id)
    .slice(0, 8)
    .map((track) => ({ ...attachScore(track, byId.get(Number(track.id))), reason: 'A hidden gem you might love' }));

  const recentlyAdded = selectRecentlyAdded({ ctx, limit: 8 })
    .map((track) => ({ ...attachScore(track, byId.get(Number(track.id))), reason: 'Recently added to your library' }));

  const shelves = [
    { id: 'continue', title: 'Continue Listening', priority: 1, tracks: continueListening.map((t) => ({ ...attachScore(t, byId.get(Number(t.id))), reason: 'Picked up from your recent session' })) },
    { id: 'recommended', title: 'Recommended For You', priority: 2, tracks: recommended },
    { id: 'discovery', title: 'Discovery Radar', priority: 3, tracks: discoveryRadar },
    { id: 'forgotten', title: 'Forgotten Favorites', priority: 4, tracks: forgottenFavorites },
    { id: 'hiddenGems', title: 'Hidden Gems', priority: 5, tracks: hiddenGems },
    { id: 'recentlyAdded', title: 'Recently Added', priority: 6, tracks: recentlyAdded }
  ];

  // 7. Artist Radio (when a current song is being listened to).
  if (currentTrackId) {
    const currentTrack = ctx.tracksById?.get(Number(currentTrackId));
    if (currentTrack) {
      const radioTracks = ctx.allTracks
        .filter((t) => Number(t.id) !== Number(currentTrackId) && sharesArtist(t.artist, currentTrack.artist))
        .sort((a, b) => rankOf(b.id) - rankOf(a.id))
        .slice(0, 8)
        .map((track) => ({ ...attachScore(track, byId.get(Number(track.id))), reason: `Artist Radio: ${currentTrack.artist}` }));
      if (radioTracks.length > 0) {
        shelves.unshift({ id: 'artistRadio', title: `Song Radio (${currentTrack.title})`, priority: 0, tracks: radioTracks });
      }
    }
  }

  return shelves;
}

/** Diagnostics snapshot for /api/tracks/recommendations/diagnostics. */
export async function getRecommendationDiagnostics({
  allTracks, favoritesMap = {}, userId, currentTrackId = null, limit = 10
}) {
  const ctx = await buildCtx({ allTracks, favoritesMap, userId, currentTrackId });
  const ranked = await rankedAll(ctx, currentTrackId);
  const discovery = selectDiscoveryCandidates({ ctx });
  return {
    algorithm: {
      version: ctx.config.algorithmVersion || 'v2',
      strategy: ctx.config.ranking?.strategy || 'heuristic'
    },
    context: {
      userId,
      currentTrackId: ctx.currentTrackId,
      historyLogs: ctx.playLogs.length,
      transitions: ctx.transitions.length,
      contextTtlSeconds: ctx.config.cache?.ttlSeconds
    },
    session: {
      playedIds: ctx.sessionCtx.sessionIds.size,
      sessionStarted: ctx.sessionCtx.sessionStartMs ? new Date(ctx.sessionCtx.sessionStartMs).toISOString() : null,
      averageCompletion: round3(ctx.sessionCtx.averageCompletion),
      skipRate: round3(ctx.sessionCtx.skipRate)
    },
    profile: {
      favorites: ctx.profile.favoritesCount,
      longTermArtists: topEntries1(ctx.profile.windows?.longTerm?.artistWeights, 5),
      longTermGenres: topEntries1(ctx.profile.windows?.longTerm?.genreWeights, 5)
    },
    discoveryBudget: round2(computeDiscoveryBudget(ctx)),
    top: ranked.slice(0, limit).map((item) => ({
      trackId: Number(item.track.id),
      title: item.track.title,
      artist: item.track.artist,
      score: item.totalScore,
      reason: item.reason,
      signals: pickSignals(item.signals)
    })),
    discovery: { candidates: discovery.length }
  };
}

function sharesArtist(a, b) {
  const splitA = String(a).split(/[,\/&]/).map((x) => x.trim().toLowerCase());
  const splitB = String(b).split(/[,\/&]/).map((x) => x.trim().toLowerCase());
  return splitA.some((x) => x && splitB.includes(x));
}

function round3(v) { return Math.round(v * 1000) / 1000; }
function round2(v) { return Math.round(v * 100) / 100; }
function topEntries1(map, n) {
  return map ? [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, round3(v)]) : [];
}
function pickSignals(signals) {
  return {
    artistAffinity: round3(signals.artistAffinity),
    genreAffinity: round3(signals.genreAffinity),
    completionProbability: round3(signals.completionProbability),
    discovery: round3(signals.discoveryValue),
    transition: round3(signals.transitionProbability),
    recentPlayPenalty: round3(signals.recentPlayPenalty),
    recentSkipPenalty: round3(signals.recentSkipPenalty)
  };
}