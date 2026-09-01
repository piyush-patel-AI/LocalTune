// Pipeline context + cache.
//
// buildPipelineContext() loads the heavy per-user inputs (play logs,
// transitions) exactly once per (userId, currentTrackId) within a TTL window and
// derives the session context, taste profile and transition model from them.
// Every recommendation surface shares the same context, eliminating the V1
// habit of re-scoring the library 4x per shelves request.
//
// Invalidation is event-driven: play events, favorite toggles, metadata edits
// and library rescans all call invalidateRecommendationCache(userId).

import { loadRecommendationConfig } from './config.js';
import { buildSessionContext } from './session.js';
import { buildUserProfile } from './userProfile.js';
import { buildTransitionModel } from './transitions.js';

const contextCache = new Map();

async function loadDb() {
  return import('../db.js');
}

/**
 * Build (or reuse) the shared pipeline context for a user + current track.
 * Returns a plain object; callers must treat it as read-only.
 */
export async function buildPipelineContext({
  allTracks = [],
  favoritesMap = {},
  userId = null,
  currentTrackId = null,
  forceFresh = false
}) {
  const cleanUserId = userId || 'guest';
  const key = `${cleanUserId}_${currentTrackId || 'none'}`;

  if (!forceFresh && contextCache.has(key) && !isExpired(contextCache.get(key))) {
    return contextCache.get(key).ctx;
  }

  const db = await loadDb();
  const [rawPlayLogs, transitions] = await Promise.all([
    db.getPlayLogsForUser(cleanUserId === 'guest' ? null : cleanUserId),
    db.getTransitionsForUser(cleanUserId === 'guest' ? null : cleanUserId)
  ]);

  const config = loadRecommendationConfig();

  const tracksById = new Map(allTracks.map((t) => [Number(t.id), t]));
  // play_logs has no artist/genre columns; resolve them from the track so
  // session context and taste-profile windows can aggregate reliably.
  const playLogs = rawPlayLogs.map((log) => {
    const trk = tracksById.get(Number(log.track_id));
    if (!trk) return log;
    return { ...log, artist: trk.artist, genre: trk.genre };
  });

  const sessionCtx = buildSessionContext({
    userId: cleanUserId,
    currentTrackId: currentTrackId ? Number(currentTrackId) : null,
    playLogs,
    options: {
      recencyTracks: config.session.recencyTracks,
      historyDepth: config.session.historyDepth,
      timeGapNewSessionMs: config.session.timeGapNewSessionMs
    }
  });
  const profile = buildUserProfile({
    userId: cleanUserId,
    playLogs,
    favoritesMap,
    options: {
      recencyDays: config.session.recencyDays,
      lovedCompletionRatio: config.familiarity.lovedCompletionRatio
    }
  });
  const transitionModel = buildTransitionModel({ transitions, options: config.transitions });

  const playLogMap = new Map();
  for (const log of playLogs) {
    const id = Number(log.track_id);
    if (!playLogMap.has(id)) playLogMap.set(id, []);
    const bucket = playLogMap.get(id);
    if (bucket.length < 60) bucket.push(log);
  }

  const ctx = {
    db,
    allTracks,
    tracksById,
    playLogs,
    transitions,
    playLogMap,
    favoritesMap,
    userId: cleanUserId,
    currentTrackId: currentTrackId ? Number(currentTrackId) : null,
    config,
    sessionCtx,
    profile,
    transitionModel
  };

  contextCache.set(key, { ctx, at: Date.now() });
  enforceSizeLimit();
  return ctx;
}

function isExpired(entry) {
  const ttlSeconds = entry.ctx.config?.cache?.ttlSeconds ?? 300;
  return Date.now() - entry.at > ttlSeconds * 1000;
}

function enforceSizeLimit() {
  const max = 500;
  while (contextCache.size > max) {
    const oldestKey = contextCache.keys().next().value;
    contextCache.delete(oldestKey);
  }
}

/**
 * Event-driven invalidation. With a userId only that user's contexts are
 * dropped (play/favorite/telemetry changes); without one the whole cache is
 * cleared (library rescan / metadata refresh).
 */
export function invalidateRecommendationCache(userId) {
  if (userId) {
    const prefix = `${userId}_`;
    for (const key of [...contextCache.keys()]) {
      if (key.startsWith(prefix)) contextCache.delete(key);
    }
  } else {
    contextCache.clear();
  }
}

export function contextCacheSize() {
  return contextCache.size;
}