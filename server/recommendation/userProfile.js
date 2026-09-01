// Long-term / short-term user taste profile built from play_logs + favorites.
// Produces 0..1 affinity signals consumed by features.js so the ranking stage
// stays a pure function of the profile.

import { primaryArtist, normalizeGenre } from './util.js';

const MS_DAY = 86400000;

export function buildUserProfile({
  userId = null,
  playLogs = [],
  favoritesMap = {},
  options = {}
}) {
  const cfg = { recencyDays: { recent: 21, longTerm: 90 }, ...options };
  const now = Date.now();
  const newestFirst = playLogs;

  // ---- Track-level stats --------------------------------------------
  const trackStats = new Map(); // trackId -> aggregated stats
  for (const log of newestFirst) {
    const id = log.track_id;
    const s = trackStats.get(id) || {
      trackId: id,
      playCount: 0,
      completions: 0,
      replays: 0,
      skips: 0,
      completionSum: 0,
      lastPlayedMs: 0,
      firstPlayedMs: now,
      listensMs: []
    };
    const ts = new Date(log.timestamp).getTime();
    s.playCount += 1;
    const ratio = Number(log.completion_ratio) || 0;
    s.completionSum += ratio;
    if (ratio >= (options.lovedCompletionRatio || 0.85)) s.completions += 1;
    if (log.is_replay) s.replays += 1;
    if (log.is_skip) s.skips += 1;
    s.listenMs = s.listenMs || [];
    s.listenMs.push(ts);
    s.lastPlayedMs = Math.max(s.lastPlayedMs, ts);
    s.firstPlayedMs = Math.min(s.firstPlayedMs, ts);
    if (s.listenMs.length > 60) s.listenMs.splice(0, s.listenMs.length - 60);
    trackStats.set(id, s);
  }
  for (const s of trackStats.values()) {
    s.avgCompletion = s.playCount ? s.completionSum / s.playCount : 0;
    s.completionRate = s.playCount ? s.completions / s.playCount : 0;
    s.replayRate = s.playCount ? s.replays / s.playCount : 0;
    s.skipRate = s.playCount ? s.skips / s.playCount : 0;
  }

  const trackById = new Map();
  for (const row of playLogs) if (row.track_id && !trackById.has(row.track_id)) trackById.set(row.track_id, row);

  const favoriteIds = new Set(Object.keys(favoritesMap).map((k) => Number(k)));
  const favoriteArtists = new Set();
  for (const id of favoriteIds) {
    const meta = trackById.get(id);
    if (meta) parseArtistsOf(meta.artist).forEach((a) => favoriteArtists.add(a));
  }

  // ---- Multi-window affinity maps (recency-weighted) -----------------
  const windows = {};
  for (const [name, days] of Object.entries(cfg.recencyDays)) {
    const cut = now - days * MS_DAY;
    const logs = newestFirst.filter((l) => new Date(l.timestamp).getTime() >= cut);
    windows[name] = {
      playCount: logs.length,
      artistWeights: weightedCounts(logs, (l) => primaryArtist(l.artist), favoriteArtists),
      genreWeights: weightedCounts(logs, (l) => normalizeGenre(l.genre)),
      albumWeights: weightedCounts(logs, (l) => l.album),
      topArtists: topKeys(logs, (l) => primaryArtist(l.artist)),
      topGenres: topKeys(logs, (l) => normalizeGenre(l.genre))
    };
    const skips = logs.filter((l) => l.is_skip).length;
    windows[name].skipRate = logs.length ? skips / logs.length : 0;
  }

  return {
    userId,
    now,
    favoritesCount: favoriteIds.size,
    favoriteIds,
    favoriteArtists,
    trackStats,
    windows,
    historySize: newestFirst.length,
    heavilyPlayedTracks: topTrackIds(trackStats, 15)
  };
}

function parseArtistsOf(raw) {
  if (!raw) return [];
  return String(raw).split(/[,\/&]/).map((a) => a.trim()).filter(Boolean).slice(0, 4);
}

/** Recency-decayed counts of a derived key, with optional favorite boost. */
function weightedCounts(logs, keyFn, boostKeys = null) {
  const counts = new Map();
  for (const log of logs) {
    const key = keyFn(log);
    if (!key) continue;
    const ageDays = Math.max(0, (Date.now() - new Date(log.timestamp).getTime()) / MS_DAY);
    const decay = Math.exp(-ageDays / 30);
    let w = decay;
    if (boostKeys && (boostKeys.has(key) || Array.from(boostKeys).some((k) => String(k).toLowerCase() === String(key).toLowerCase()))) {
      w *= 1.3;
    }
    counts.set(key, (counts.get(key) || 0) + w);
  }
  const max = Math.max(0, ...counts.values());
  const norm = new Map();
  for (const [k, v] of counts) norm.set(k, max > 0 ? v / max : 0);
  return norm;
}

function topKeys(logs, keyFn) {
  const counts = new Map();
  for (const log of logs) {
    const key = keyFn(log);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => key);
}

function topTrackIds(trackStats, n) {
  return [...trackStats.values()]
    .sort((a, b) => b.playCount - a.playCount)
    .slice(0, n)
    .map((s) => s.trackId);
}

/** Convenience accessors used by features.js. */
export function artistAffinityOf(profile, name) {
  const norm = profile?.windows?.longTerm?.artistWeights;
  if (!norm) return 0;
  return norm.get(name) ?? norm.get(String(name).toLowerCase()) ?? 0;
}

export function genreAffinityOf(profile, genre) {
  const key = normalizeGenre(genre);
  const norm = profile?.windows?.longTerm?.genreWeights;
  if (!norm || !key) return 0;
  return norm.get(key) ?? 0;
}

export function albumAffinityOf(profile, album) {
  const norm = profile?.windows?.longTerm?.albumWeights;
  if (!norm || !album) return 0;
  return norm.get(album) ?? 0;
}