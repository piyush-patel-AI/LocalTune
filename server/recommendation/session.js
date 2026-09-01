// Session context: slices listening history into recency windows and identifies
// the current listening session (gap-detected) plus time-of-day context.
//
// playLogs should be pre-sorted newest-first (as returned by getPlayLogsForUser).

import { primaryArtist } from './util.js';

export function buildSessionContext({
  userId = null,
  currentTrackId = null,
  playLogs = [],
  options = {}
}) {
  const cfg = { recencyTracks: { veryRecent: 3, session: 15 }, historyDepth: 30, timeGapNewSessionMs: 30 * 60 * 1000, ...options };
  const now = Date.now();
  const newestFirst = playLogs;

  const trackHistory = [...newestFirst].reverse().slice(-cfg.historyDepth).map((l) => ({
    trackId: l.track_id,
    timestampMs: new Date(l.timestamp).getTime(),
    listenedSeconds: Number(l.listened_seconds) || 0,
    durationSeconds: Number(l.duration_seconds) || 0,
    completionRatio: Number(l.completion_ratio) || 0,
    isSkip: !!l.is_skip,
    artist: l.artist,
    genre: l.genre
  }));

  const allPlayedIds = trackHistory.map((p) => p.trackId);
  const veryRecentIds = allPlayedIds.slice(-cfg.recencyTracks.veryRecent).filter(Boolean);
  const sessionIds = allPlayedIds.slice(-cfg.recencyTracks.session).filter(Boolean);

  let sessionStartMs = null;
  if (trackHistory.length > 0) {
    sessionStartMs = trackHistory[trackHistory.length - 1].timestampMs;
    for (let i = trackHistory.length - 2; i >= 0; i -= 1) {
      const gap = trackHistory[i + 1].timestampMs - trackHistory[i].timestampMs;
      if (gap > cfg.timeGapNewSessionMs) {
        sessionStartMs = trackHistory[i + 1].timestampMs; // after the gap
        break;
      }
    }
  }

  const sessionPlays = trackHistory.filter((p) =>
    sessionStartMs !== null ? p.timestampMs >= sessionStartMs : true
  );
  const timeOfDay = new Date().getHours();
  const currentWindowHr = timeOfDay;

  return {
    userId,
    currentTrackId,
    now,
    timeOfDay,
    trackHistory,
    allPlayedIds,
    veryRecentIds: new Set(veryRecentIds),
    sessionIds: new Set(sessionIds),
    sessionStartMs,
    sessionPlays,
    sessionArtistCounts: countWeighted(sessionPlays, (p) => primaryArtist(p.artist)),
    sessionGenreCounts: countWeighted(sessionPlays, (p) => p.genre),
    totalPlaysToday: newestFirst.filter((p) => {
      const a = new Date(p.timestamp).getTime();
      return timeSinceHours(now, a) < 24;
    }).length,
    averageCompletion: avg(newestFirst.map((p) => Number(p.completion_ratio) || 0)),
    skipRate: newestFirst.length > 0
      ? newestFirst.filter((p) => p.is_skip).length / newestFirst.length
      : 0
  };
}

function countWeighted(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function timeSinceHours(now, then) {
  return (now - then) / 3600000;
}

/** Streaming-friendly alias used by pipelines that only have recent logs in memory. */
export function isFreshSession(sessionContext) {
  if (!sessionContext || !sessionContext.now) return false;
  const lastAt = sessionContext.trackHistory[sessionContext.trackHistory.length - 1]?.timestampMs;
  if (!lastAt) return true; // no history -> treat as a brand new session
  return sessionContext.now - lastAt < sessionContext.timeGapNewSessionMs;
}