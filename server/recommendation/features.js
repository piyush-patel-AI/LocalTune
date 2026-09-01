// Candidate feature computation. Produces a normalized 0..1 signal vector per
// candidate plus raw penalty diagnostics. rank.js turns these into a score via
// config weights. Kept free of I/O so the vector layer is ML-ready: a learned
// ranker consumes the exact same vectors.

import { parseArtists, primaryArtist, normalizeGenre, clamp, toTimestamp } from './util.js';
import { artistAffinityOf, genreAffinityOf } from './userProfile.js';

const MS_MIN = 60000;
const MS_HOUR = 3600000;
const MS_DAY = 86400000;

/** Compute the raw signal vector (used directly by rankers without the breakdown). */
export function computeSignals(track, ctx) {
  const id = Number(track.id);
  const currentTrack = ctx.currentTrackId ? ctx.tracksById?.get(Number(ctx.currentTrackId)) : null;
  const stats = ctx.profile?.trackStats?.get(id);
  const playLogs = ctx.playLogMap?.get(id) || [];
  const artists = parseArtists(track.artist);
  const genre = normalizeGenre(track.genre);

  // -- positive signals ------------------------------------------------
  const currentTrackMatch = currentTrack
    ? (artists.some((a) => parseArtists(currentTrack.artist).includes(a)) ? 1.0
      : String(track.album).toLowerCase() === String(currentTrack.album).toLowerCase() ? 0.8
        : genre && genre === normalizeGenre(currentTrack.genre) ? 0.7 : 0)
    : 0;

  const sessionTopArtist = topShare(ctx.sessionCtx.sessionArtistCounts, artists);
  const sessionTopGenre = topShare(ctx.sessionCtx.sessionGenreCounts, [genre]);
  const sessionMatch = Math.max(sessionTopArtist, sessionTopGenre);

  const transitionProbability = currentTrack
    ? normalizeTransition(ctx.transitionModel.probability(Number(currentTrack.id), id), ctx.config?.transitions?.maxProbability)
    : 0;

  const artistAffinity = artistAffinityOf(ctx.profile, primaryArtist(track.artist));
  const genreAffinity = genreAffinityOf(ctx.profile, genre);

  const played = playLogs.length > 0;
  const avgCompletion = stats?.avgCompletion ?? 0;
  const completionProbability = played ? clamp(avgCompletion, 0, 1) : 0.35;

  const favoriteProbability = ctx.profile?.favoriteIds?.has(id) ? 1.0 : 0;
  const replayRate = stats?.replayRate ?? 0;
  const discoveryValue = discoveryFor(ctx, id, playLogs.length);
  const freshness = libraryFreshness(track, ctx);
  const qualitySignal = qualityOf(track);
  const explorationValue = clamp(1 - Math.max(artistAffinity, genreAffinity), 0, 1);
  const timeOfDay = timeOfDayMatch(ctx, track);

  // -- penalty signals (severity in 0..1) ------------------------------
  const recentPlayPenalty = recencyPenalty(stats?.lastPlayedMs, ctx.config?.ranking?.recencyDecay);
  const repeatedRecPenalty = clamp(Number(track.recommendation_count || 0) / 12, 0, 1);
  const recentSkipPenalty = clamp((stats?.skips || 0) / 4, 0, 1) * (recentRecencyDays(stats?.lastPlayedMs));
  const playedInSession = ctx.sessionCtx.sessionIds.has(id);
  const sessionDuplicatePenalty = playedInSession ? 1 : 0;
  const artistOverusePenalty = clamp((sessionTopArtist - 0.5) / 0.5, 0, 1);

  return {
    id,
    currentTrackMatch,
    sessionMatch,
    transitionProbability,
    artistAffinity,
    genreAffinity,
    completionProbability,
    favoriteProbability,
    discoveryValue,
    replayRate,
    freshness,
    qualitySignal,
    explorationValue,
    timeOfDay,
    recentPlayPenalty,
    repeatedRecPenalty,
    recentSkipPenalty,
    sessionDuplicatePenalty,
    artistOverusePenalty,
    meta: {
      playCount: playLogs.length,
      played,
      playedInSession,
      lastPlayedMs: stats?.lastPlayedMs || null,
      genre,
      artist: primaryArtist(track.artist),
      album: track.album
    }
  };
}

/** Compose the additive scoreBreakdown (V1-compatible keys + V2 extras). */
export function buildBreakdown(track, signals, weights, penalties) {
  const pos = {
    artist: signals.artistAffinity * (weights.artistAffinity ?? 12),
    genre: signals.genreAffinity * (weights.genreAffinity ?? 12),
    completion: signals.completionProbability * (weights.completionProbability ?? 10),
    discovery: signals.discoveryValue * (weights.discoveryValue ?? 10),
    transition: signals.transitionProbability * (weights.transitionProbability ?? 16),
    recent: signals.freshness * (weights.freshness ?? 6),
    timeOfDay: signals.timeOfDay * (weights.timeOfDay ?? 5),
    replays: signals.replayRate * (weights.replayWeight ?? 8),
    favorites: signals.favoriteProbability * (weights.favoriteProbability ?? 8),
    currentTrackMatch: signals.currentTrackMatch * (weights.currentTrackMatch ?? 22),
    sessionMatch: signals.sessionMatch * (weights.sessionMatch ?? 18),
    freshness: 0, // 'recent' legacy key already holds freshness
    quality: signals.qualitySignal * (weights.qualitySignal ?? 4),
    exploration: signals.explorationValue * (weights.explorationValue ?? 3)
  };
  const neg = {
    skips: -signals.recentSkipPenalty * (penalties.recentSkipPenaltyMax ?? 35),
    recentPenalty: -signals.recentPlayPenalty * (penalties.recentPlayPenaltyMax ?? 30),
    repeated: -signals.repeatedRecPenalty * (penalties.repeatedRecommendationPenaltyMax ?? 8),
    sessionDup: -signals.sessionDuplicatePenalty * (penalties.sessionDuplicatePenalty ?? 12),
    overuse: -signals.artistOverusePenalty * (penalties.artistOverusePenaltyMax ?? 15)
  };
  return { ...pos, ...neg };
}

/** Dominant-reason text for a candidate (never emits 'never played' for played tracks). */
export function deriveReason(track, signals, currentTrack) {
  const breakdown = { artist: signals.artistAffinity, genre: signals.genreAffinity, completion: signals.completionProbability, transition: signals.transitionProbability, favorite: signals.favoriteProbability, sessionMatch: signals.sessionMatch, current: signals.currentTrackMatch, discovery: signals.discoveryValue, recent: signals.freshness, timeOfDay: signals.timeOfDay };
  const ranked = Object.entries(breakdown).sort((a, b) => b[1] - a[1] || a[1] - b[1]);
  const [topKey, topVal] = ranked[0];
  if (topVal <= 0) return 'Because you enjoy this style';

  const genre = normalizeGenre(track.genre);
  switch (topKey) {
    case 'artist': return 'From your favorite artists';
    case 'genre': return `Matches your favorite genres${genre ? ` (${genre})` : ''}`;
    case 'completion': return 'Tracks you love to finish';
    case 'transition':
      return currentTrack ? `Frequently played after ${currentTrack.title}` : 'Great follow-up to your last track';
    case 'favorite': return 'From your favorited tracks';
    case 'sessionMatch': return 'From your recent session';
    case 'current': return currentTrack ? `Similar to ${currentTrack.title}` : 'Similar to recent listening';
    case 'discovery': return signals.meta.playCount > 0 ? 'A hidden gem you might love' : "You've never played this track";
    case 'recent': return 'Recently added to your library';
    case 'timeOfDay': return 'Popular during your typical listening time';
    default: return 'Because you enjoy this style';
  }
}

// ---------------------------------------------------------------- helpers

function normalizeTransition(p, maxProb) {
  if (!p) return 0;
  const cap = maxProb || 0.5;
  return clamp(p / cap, 0, 1);
}

function topShare(counts, keys) {
  const entries = Object.entries(counts || {});
  if (!entries.length || !keys.length) return 0;
  const max = Math.max(...entries.map(([, v]) => v));
  if (!max) return 0;
  let share = 0;
  for (const key of keys) {
    if (!key) continue;
    const match = entries.find(([k]) => String(k).toLowerCase() === String(key).toLowerCase());
    share = Math.max(share, (match?.[1] || 0) / max);
  }
  return share;
}

function recencyPenalty(lastPlayedMs, decay) {
  if (!lastPlayedMs) return 0;
  const hours = (Date.now() - lastPlayedMs) / MS_HOUR;
  const tiers = decay?.recentPlayPenaltyHours || [2, 12, 48, 168];
  const values = decay?.recentPlayPenaltyValues || [30, 18, 8, 0];
  const base = values[0] || 1;
  for (let i = 0; i < tiers.length; i += 1) {
    if (hours < tiers[i]) return (values[i] || 0) / base;
  }
  return 0;
}

function recentRecencyDays(lastPlayedMs) {
  if (!lastPlayedMs) return 0;
  return (Date.now() - lastPlayedMs) <= 7 * MS_DAY ? 1 : 0;
}

function discoveryFor(ctx, trackId, playCount) {
  if (playCount === 0) return 1;
  if (playCount === 1) return 0.75;
  if (playCount === 2) return 0.5;
  return 0.15;
}

function libraryFreshness(track, ctx) {
  const added = toTimestamp(track.date_added) || toTimestamp(track.date_modified);
  if (!added) return 0.5;
  let min = Infinity;
  let max = -Infinity;
  for (const t of ctx.allTracks) {
    const ts = toTimestamp(t.date_added) || toTimestamp(t.date_modified);
    if (!ts) continue;
    min = Math.min(min, ts);
    max = Math.max(max, ts);
  }
  if (!Number.isFinite(min) || max === min) return 0.5;
  return clamp((added - min) / (max - min), 0, 1);
}

function qualityOf(track) {
  const duration = Number(track.duration_seconds) || 0;
  const hasMeta = !!track.title && !!track.artist;
  if (!hasMeta) return 0;
  if (duration < 15 || duration > 7200) return 0.2;
  return 1.0;
}

function timeOfDayMatch(ctx, track) {
  const hour = ctx.sessionCtx.timeOfDay;
  const logs = ctx.playLogMap?.get(Number(track.id)) || [];
  if (!logs.length) return 0;
  const inHour = logs.filter((l) => Number(l.hour_of_day) === hour).length;
  return clamp(inHour / logs.length, 0, 1);
}