// Octave Recommendation V2 barrel.
//
// Recommendation is now implemented in server/recommendation/ (multi-stage,
// session-aware pipeline). This file re-exports its public surface so existing
// routes, tests and the DebugScoreModal keep working unchanged.
//
//   - scoreTracks, generateRecommendations, generateDiscoveryRadar,
//     generateForgottenFavorites, generateAutoplayTracks, generateShelves,
//     invalidateRecommendationCache, loadRecommendationConfig
//
// The frozen single-pass V1 engine lives at:
//   server/recommendation/legacy/v1Engine.js   (for A/B benchmarking)
//
// The frozen V2 pipeline implementation is at: server/recommendation/index.js

export {
  scoreTracks,
  generateRecommendations,
  generateDiscoveryRadar,
  generateForgottenFavorites,
  generateAutoplayTracks,
  generateShelves,
  getRecommendationDiagnostics,
  invalidateRecommendationCache,
  loadRecommendationConfig,
  legacy
} from './recommendation/index.js';

export { parseArtists } from './recommendation/legacy/v1Engine.js';
export { computeSignals } from './recommendation/features.js';
export { rankCandidates, resolveRanker } from './recommendation/rank.js';
export { buildPipelineContext, contextCacheSize } from './recommendation/cache.js';
export { loadLegacyV1Config } from './recommendation/config.js';