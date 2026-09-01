// Shared helpers for the recommendation pipeline. Kept dependency-free and pure
// so every stage is trivially unit-testable in isolation.

export const UNKNOWN_ARTIST = 'unknown';

/** Split a [possibly multi-artist] string/"Artist A feat. Artist B" into names. */
export function parseArtists(artist) {
  if (!artist || typeof artist !== 'string') return [];
  const cleaned = artist
    .replace(/feat\.?/gi, ',')
    .replace(/ft\.?/gi, ',')
    .replace(/&| and | with /gi, ',')
    .replace(/‘/g, "'")
    .trim();
  if (!cleaned) return [];
  return [...new Set(cleaned.split(',').map((a) => a.trim()).filter(Boolean))];
}

/** Primary artist name for grouping/dedup purposes. */
export function primaryArtist(artist) {
  return parseArtists(artist)[0] || UNKNOWN_ARTIST;
}

/** Coarse time-of-day window used by both V1 and V2 engines. */
export function getTimeWindow(hour) {
  if (hour >= 5 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 22) return 'Evening';
  return 'Late Night';
}

export function normalizeGenre(genre) {
  if (!genre) return null;
  return String(genre).trim().toLowerCase();
}

export function toTimestamp(value) {
  if (!value) return NaN;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? NaN : ms;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Deterministic weighted top-k selection without Math.random(). */
export function topKByScore(items, count, getScore) {
  return items
    .map((item, index) => ({ item, index, score: getScore(item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, count)
    .map(({ item }) => item);
}

export function safeInt(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) ? n : null;
}

export function normDistribution(map) {
  const total = Object.values(map).reduce((a, b) => a + (Number(b) || 0), 0);
  if (!total) return map;
  const out = {};
  for (const [k, v] of Object.entries(map)) out[k] = (Number(v) || 0) / total;
  return out;
}