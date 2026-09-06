import { api } from './api.js';

/**
 * Artwork-derived ambient background for the Now Playing player.
 *
 * Split into pure helpers so the derivation can be unit-tested without a
 * DOM. Runtime extraction genuinely happens once per artwork change (see
 * ExpandedPlayer's effect) and the result is cached by stable artwork
 * identity — never on playback progress ticks.
 */

export const FALLBACK_AMBIENT_COLOR = '#141118';
export const AMBIENT_TRANSITION_MS = 600;
const CANVAS_SAMPLE = 48;

/**
 * Resolve the artwork URL for a track using the same precedence the rest of
 * the app uses: explicit coverUrl, then cover_art_url, then the server art
 * endpoint keyed by track id.
 */
export function resolveArtworkUrl(track) {
  if (!track) return '';
  return track.coverUrl || track.cover_art_url || api.getTrackArtUrl(track.id);
}

/**
 * Stable cache identity for derived colors: track id + artwork URL. Two
 * different tracks (or changed artwork on the same track) yield different
 * keys; revisiting the identical artwork reuses the cached color.
 */
export function ambientKey(track, artUrl) {
  return `${track?.id}::${artUrl || ''}`;
}

/**
 * Pure single-pass color quantization over raw RGBA bytes (ImageData).
 *
 * Picks the most frequent quantized color bucket that is neither too dark nor
 * too close to grey so the ambient wash visibly relates to the artwork. Falls
 * back to the overall average when everything is too dark, and returns null
 * when there are no visible pixels at all.
 *
 * @param {{ data: Uint8ClampedArray, width: number }} image
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function sampleImageData({ data, width }) {
  if (!data || data.length === 0) return null;

  const buckets = new Map();

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    const a = data[i + 3];
    if (a < 125) continue; // skip transparent pixels

    // Quantize to reduce noise and collapse near-identical shades
    r = Math.round(r / 32) * 32;
    g = Math.round(g / 32) * 32;
    b = Math.round(b / 32) * 32;

    const key = `${r},${g},${b}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  if (buckets.size === 0) return null;

  // Prefer the most frequent bucket that is vivid enough and not too dark.
  let best = null;
  let bestScore = -Infinity;
  for (const [key, count] of buckets) {
    const [r, g, b] = key.split(',').map(Number);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (lum < 45) continue; // too dark — would blend into the black player
    // Favor frequency, boosted by saturation so colorful artworks keep identity
    const score = count * (1 + sat * 2);
    if (score > bestScore) {
      bestScore = score;
      best = { r, g, b };
    }
  }

  // Fallback: if everything was too dark, use the overall average (kept dark)
  if (!best) {
    let R = 0;
    let G = 0;
    let B = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 125) continue;
      R += data[i];
      G += data[i + 1];
      B += data[i + 2];
      n++;
    }
    if (n === 0) return null;
    return { r: Math.round(R / n), g: Math.round(G / n), b: Math.round(B / n) };
  }

  // Dim so it reads as an ambient wash, not a solid color block
  const dim = 0.5;
  return {
    r: Math.round(best.r * dim),
    g: Math.round(best.g * dim),
    b: Math.round(best.b * dim),
  };
}

/**
 * Extract a representative rgba() string from a loaded <img>. Uses a tiny
 * canvas read once per artwork. Any failure (tainted canvas, decode error)
 * returns null so callers can fall back safely.
 */
export function extractDominantColor(img) {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = CANVAS_SAMPLE;
    canvas.height = CANVAS_SAMPLE;
    ctx.drawImage(img, 0, 0, CANVAS_SAMPLE, CANVAS_SAMPLE);
    const { data } = ctx.getImageData(0, 0, CANVAS_SAMPLE, CANVAS_SAMPLE);
    const rgb = sampleImageData({ data, width: CANVAS_SAMPLE });
    return rgb ? `rgb(${rgb.r},${rgb.g},${rgb.b})` : null;
  } catch (_) {
    return null;
  }
}

/**
 * Ambient radial-gradient field for the player. The album artwork stays the
 * visual focal point; the color wash only softly extends its palette.
 */
export function buildAmbientGradient(color) {
  const accent = color || FALLBACK_AMBIENT_COLOR;
  return `radial-gradient(circle at 50% 30%, ${accent} 0%, rgba(30,10,35,0.95) 70%, #030303 100%)`;
}

/**
 * Safe V3 fallback background when no artwork or no colors are available.
 * Deliberately not pure black so the never-broken state reads as a subtle
 * dark ambient panel rather than a hard flash.
 */
export function buildFallbackBackground() {
  return `radial-gradient(circle at 50% 30%, ${FALLBACK_AMBIENT_COLOR} 0%, rgba(30,10,35,0.95) 70%, #030303 100%)`;
}