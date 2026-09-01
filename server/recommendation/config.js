// Config loader for the recommendation pipeline.
//
// Policy lives in config/recommendation.json:
//   - top-level 'weights'/'thresholds'  -> V1 engine values (frozen, for A/B)
//   - 'pipeline'                        -> V2 pipeline policy (used here)
//
// Missing keys fall back to the built-in DEFAULTS so the system never crashes
// on a stale/partial config file. Deep-merges user-supplied overrides.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, '../../config/recommendation.json');

const DEFAULTS = {
  cache: { ttlSeconds: 300, profileTtlSeconds: 600, sessionTtlSeconds: 300, maxEntries: 500 },
  session: {
    historyDepth: 30,
    recencyTracks: { veryRecent: 3, session: 15 },
    recencyDays: { recent: 21, longTerm: 90 },
    timeGapNewSessionMs: 1800000
  },
  retrieval: {
    candidateLimit: 120,
    sourceWeights: {
      currentTrack: 0.28, sessionAffinity: 0.24, transition: 0.18,
      longTermTaste: 0.16, discovery: 0.1, exploration: 0.04
    },
    currentTrack: { artistWeight: 1.0, genreWeight: 0.9, albumWeight: 0.8 },
    discovery: { maxNeverPlayed: 20, maxRarelyPlayed: 20, minGenreAffinity: 2.0, minArtistAffinity: 1.5 },
    exploration: { maxPoolSize: 15, qualityFloor: 0.4 }
  },
  transitions: {
    maxProbability: 0.5, minConfidenceCount: 3, confidenceLogBase: 2,
    recencyHalfLifeDays: 21, artistLevelFallback: true, evidenceWeightCap: 16
  },
  ranking: {
    strategy: 'heuristic',
    weights: {
      currentTrackMatch: 22, sessionMatch: 18, transitionProbability: 16,
      artistAffinity: 12, genreAffinity: 12, completionProbability: 10,
      favoriteProbability: 8, freshness: 6, discoveryValue: 10,
      qualitySignal: 4, explorationValue: 3, timeOfDay: 5, replayWeight: 8
    },
    penalties: {
      recentPlayPenaltyMax: 30, repeatedRecommendationPenaltyMax: 25,
      recentSkipPenaltyMax: 35, artistOverusePenaltyMax: 15,
      albumOverusePenaltyMax: 12, sessionDuplicatePenalty: 25,
      cooldownPenalty: 30, sameSessionExclusionPenalty: 60
    },
    recencyDecay: {
      recentPlayPenaltyHours: [2, 12, 48, 168],
      recentPlayPenaltyValues: [30, 18, 8, 0]
    }
  },
  cooldown: { recommendationCooldownHours: 6, skipCooldownHours: 72 },
  diversity: {
    maxSameArtist: 2, maxSameAlbumPerN: 1, maxGenreStreak: 3,
    artistSoftPenalty: 12, albumSoftPenalty: 10, genreStreakPenalty: 7, artistWindow: 6
  },
  discovery: {
    budgetRatios: {
      highConfidence: 0.3, related: 0.25, fresh: 0.2, trusted: 0.15, exploration: 0.1
    },
    adaptive: { completionThreshold: 0.5, skipRateThreshold: 0.35, discoveryBoostMax: 1.5, discoveryShrinkMin: 0.5 }
  },
  antiRepetition: {
    sameSessionExclusionMs: 7200000, queueDedupHard: true, maxArtistPerQueue: 3, maxAlbumPerQueue: 2
  },
  familiarity: {
    lovedCompletionRatio: 0.85, veryRecentHours: 48, replayRecoveryDays: 7, skipSuppressionDays: 3
  },
  telemetry: { defaultSurface: 'generic', outcomeLookbackHours: 2, impressionLogging: true }
};

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      out[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

let cached = null;

/**
 * Load the effective V2 pipeline config (file merged over defaults).
 * Result is frozen to keep the engine deterministic within a release.
 */
export function loadRecommendationConfig() {
  if (cached) return cached;
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')).pipeline || {};
  } catch {
    // File missing/unreadable -> fall back to built-in defaults.
  }
  cached = deepMerge(DEFAULTS, fileConfig);
  return cached;
}

/** V1 weights/thresholds verbatim (for A/B benchmarks against the frozen engine). */
export function loadLegacyV1Config() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    cfg = {};
  }
  return { weights: cfg.weights || {}, thresholds: cfg.thresholds || {} };
}

export const RECOMMENDER_DEFAULTS = DEFAULTS;

export function resetRecommendationConfigForTests() {
  cached = null;
}