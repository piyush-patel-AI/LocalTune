// Transition model: learns P(next | current) from song_transitions rows,
// incorporating confidence (count) and recency decay. This replaces the V1
// habit of adding (count * constant) to the score with a calibrated probability
// that is comparable across artists/genres.

import { parseArtists, clamp } from './util.js';

const MS_DAY = 86400000;

export function buildTransitionModel({ transitions = [], options = {}, now = Date.now() }) {
  const cfg = {
    maxProbability: 0.5,
    minConfidenceCount: 3,
    confidenceLogBase: 2,
    evidenceWeightCap: 16,
    recencyHalfLifeDays: 21,
    ...options
  };
  const halfLifeMs = cfg.recencyHalfLifeDays * MS_DAY;
  // fromId -> Map(toId -> { count, weighted, lastTs })
  const byFrom = new Map();

  for (const row of transitions) {
    const fromId = row.from_track_id;
    const toId = row.to_track_id;
    if (!fromId || !toId) continue;
    const count = Number(row.transition_count) || 0;
    if (count <= 0) continue;
    const lastTs = new Date(row.last_transition_time).getTime();
    const ageDays = now > lastTs ? Math.max(0, (now - lastTs) / MS_DAY) : 0;
    const recency = Math.pow(0.5, ageDays / halfLifeMs);
    let bucket = byFrom.get(fromId);
    if (!bucket) {
      bucket = new Map();
      byFrom.set(fromId, bucket);
    }
    const prev = bucket.get(toId);
    bucket.set(toId, {
      toId,
      count,
      recency,
      weighted: (prev?.weighted || 0) + count * recency,
      lastTs: Math.max(prev?.lastTs || 0, lastTs)
    });
  }

  const model = new Map();
  for (const [fromId, bucket] of byFrom) {
    const totalWeighted = [...bucket.values()].reduce((sum, r) => sum + r.weighted, 0);
    const prob = new Map();
    for (const [toId, r] of bucket) {
      const base = totalWeighted > 0 ? r.weighted / totalWeighted : 0;
      // Confidence interpolation: low-count evidence is pulled toward 0 so a
      // single stray transition never dominates; high counts saturate near the
      // configured ceiling.
      const evidence = Math.min(r.count, cfg.evidenceWeightCap);
      const confidence = Math.log2(evidence + 1) / Math.log2(cfg.evidenceWeightCap + 1);
      prob.set(toId, clamp(base * confidence, 0, cfg.maxProbability));
    }
    model.set(fromId, prob);
  }

  return {
    byFrom: model,
    /** probability [0..1] of transitioning from -> to. */
    probability(fromId, toId) {
      const m = model.get(fromId);
      return m?.get(toId) || 0;
    },
    /** ordered [toId, probability] list for a given from-track. */
    choices(fromId) {
      const m = model.get(fromId);
      if (!m) return [];
      return [...m.entries()]
        .map(([toId, p]) => ({ toId, probability: p }))
        .sort((a, b) => b.probability - a.probability);
    }
  };
}

/** Fallback at artist granularity: P(artistB | artistA) from artist-name rows. */
export function buildArtistTransitionModel({ transitions = [], options = {}, now = Date.now() }) {
  const cfg = { minConfidenceCount: 2, ...options };
  const byFrom = new Map();
  for (const row of transitions) {
    const fromA = parseArtists(row.from_artist || row.fromArtist)[0];
    const toA = parseArtists(row.to_artist || row.toArtist)[0];
    if (!fromA || !toA || fromA === toA) continue;
    const count = Number(row.transition_count) || 0;
    if (count < cfg.minConfidenceCount) continue;
    let b = byFrom.get(fromA);
    if (!b) { b = new Map(); byFrom.set(fromA, b); }
    b.set(toA, Math.max(b.get(toA) || 0, count));
  }
  const prob = new Map();
  for (const [fromA, bucket] of byFrom) {
    const total = [...bucket.values()].reduce((a, b) => a + b, 0);
    const m = new Map();
    for (const [toA, n] of bucket) m.set(toA, total > 0 ? n / total : 0);
    prob.set(fromA, m);
  }
  return {
    byFrom: prob,
    probability(fromArtist, toArtist) {
      return prob.get(fromArtist)?.get(toArtist) || 0;
    }
  };
}