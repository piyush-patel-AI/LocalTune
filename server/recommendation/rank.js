// Ranking stage: turns the shared feature vectors into a scored, ordered list.
//
// The public entry point resolveRanker() returns a deterministic strategy chosen
// from config.ranking.strategy. Today every strategy is a transparent heuristic
// ranker; learnedRanker()/sequenceModelRanker() are wired as sealed slots so a
// future Transformer ranker can swap in without re-plumbing the pipeline.

import { computeSignals, buildBreakdown, deriveReason } from './features.js';

export function rankCandidates({ candidates, ctx, currentTrackId = null, count = null, rankerName = null }) {
  const config = ctx.config;
  const strategy = rankerName || config.ranking?.strategy || 'heuristic';
  const weights = config.ranking?.weights || {};
  const penalties = config.ranking?.penalties || {};
  const currentTrack = currentTrackId ? (ctx.tracksById?.get(Number(currentTrackId)) || null) : null;

  const ranked = candidates.map((track) => {
    const signals = computeSignals(track, ctx);
    const breakdown = buildBreakdown(track, signals, weights, penalties);
    const totalScore = Math.max(0, Math.round(
      Object.values(breakdown).reduce((a, b) => a + (Number(b) || 0), 0)
    ));
    const reason = deriveReason(track, signals, currentTrack);
    return {
      track,
      totalScore,
      signals,
      breakdown,
      reason,
      strategy
    };
  });

  ranked.sort((a, b) =>
    b.totalScore - a.totalScore || b.signals.genreAffinity - a.signals.genreAffinity || a.track.id - b.track.id
  );

  return count ? ranked.slice(0, count) : ranked;
}

/**
 * Strategy resolution with future-ML seams:
 *   'learned'      -> instrumentation point for an offline-trained model
 *   'sequence'     -> sequence-model (Transformer-style) slot
 *   anything else  -> explicit heuristic (default)
 */
export function resolveRanker(name) {
  switch (name) {
    case 'learned':
      return learnedRanker;
    case 'sequence':
      return sequenceModelRanker;
    default:
      return heuristicRanker;
  }
}

/** Deterministic explainable ranker (default). See rankCandidates(). */
export function heuristicRanker(args) {
  return rankCandidates({ ...args, rankerName: 'heuristic' });
}

/** Reserved: learned ranking slot. Rejected until a model artifact ships. */
export function learnedRanker({ candidates }) {
  throw new Error('learning: learnedRanker requires a trained artifact; use "heuristic"');
}

/** Reserved: sequence-model (Transformer) slot. Rejected until deployment. */
export function sequenceModelRanker({ candidates }) {
  throw new Error('scan sequenceModelRanker is not deployed; use "heuristic"');
}