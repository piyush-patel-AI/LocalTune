// Anti-repetition layer: deterministic hard-exclusions applied on every
// recommendation path (recommendations, radar, autoplay, shelves).
//
// Soft signals (recency penalties, overuse) are handled by features/rank; this
// module only enforces "must not appear" rules so the UX never loops.

import { toTimestamp } from './util.js';

const MS_MIN = 60000;
const MS_HOUR = 3600000;

export function applyHardFilters({
  candidates,
  ctx,
  currentTrackId = null,
  excludeTrackIds = [],
  skipCooldownMs = null,
  lastPlayedExclusionMs = null
}) {
  const cfg = ctx.config;
  const now = Date.now();
  const exclude = new Set((excludeTrackIds || []).map((id) => Number(id)));
  if (currentTrackId) exclude.add(Number(currentTrackId));

  const lastPlayedMs = lastPlayedExclusionMs ?? 10 * MS_MIN;
  const cooldownMs = skipCooldownMs ?? (cfg.cooldown.skipCooldownHours || 72) * MS_HOUR;

  const exclusionReasons = new Map(); // trackId -> reason

  return candidates.filter((track) => {
    const id = Number(track.id);
    if (exclude.has(id)) return false;

    // Layer 2: the immediately-previous song stays out of the next pick.
    const veryRecent = ctx.sessionCtx?.veryRecentIds;
    if (veryRecent && veryRecent.size > 0) {
      // veryRecentIds holds the last few distinct play positions; exclude only
      // the most recent one unless it was played > lastPlayedExclusionMs ago.
      const lastPlayedId = ctx.sessionCtx.trackHistory[ctx.sessionCtx.trackHistory.length - 1]?.trackId;
      if (lastPlayedId !== undefined && lastPlayedId !== null && Number(lastPlayedId) === id) {
        const lastTs = ctx.sessionCtx.trackHistory[ctx.sessionCtx.trackHistory.length - 1].timestampMs;
        if (now - lastTs <= lastPlayedMs) {
          exclusionReasons.set(id, 'just played');
          return false;
        }
      }
    }

    // Layer 4: skip suppression - recently skipped tracks are seat-belted out.
    const stats = ctx.profile?.trackStats?.get(id);
    const row = ctx.tracksById?.get(id);
    if (row && row.last_skipped_at) {
      const skippedAt = toTimestamp(row.last_skipped_at);
      if (now - skippedAt <= cooldownMs) {
        exclusionReasons.set(id, `skipped recently`);
        return false;
      }
    }
    if (stats && stats.skips > 0 && (stats.lastPlayedMs && now - stats.lastPlayedMs <= 24 * MS_HOUR)) {
      exclusionReasons.set(id, 'rapid repeat');
      return false;
    }

    return true;
  });
}

/**
 * Recommendation cooldown: a track that was just served shouldn't be served
 * again until the cooldown elapses - unless its quality is exceptional.
 */
export function applyRecommendationCooldown(tracks, ctx, { exceptionalScore = null } = {}) {
  const hours = ctx.config.cooldown.recommendationCooldownHours || 6;
  const ms = hours * MS_HOUR;
  const now = Date.now();
  return tracks.filter((item) => {
    const at = toTimestamp(item.track.last_recommended_at);
    if (!at) return true;
    const elapsed = now - at;
    if (elapsed >= ms) return true;
    if (exceptionalScore !== null && item.totalScore >= exceptionalScore) return true;
    return false;
  });
}