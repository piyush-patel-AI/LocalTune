import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  resolveArtworkUrl,
  ambientKey,
  sampleImageData,
  extractDominantColor,
  buildAmbientGradient,
  buildFallbackBackground,
  FALLBACK_AMBIENT_COLOR,
} from '../services/ambientColor.js';

const readSource = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');

// Build a solid-color 48x48 Uint8ClampedArray RGBA buffer.
function solidImageData(r, g, b, a = 255) {
  const size = 48;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { data, width: size };
}

describe('Now Playing Ambient Background', () => {
  test('background derives from current artwork (sampleImageData returns color)', () => {
    const color = sampleImageData(solidImageData(200, 30, 40));
    assert.ok(color, 'color derived from solid artwork');
    assert.ok(color.r > color.b, 'red-dominant artwork yields red-dominant wash');
    assert.ok(color.r >= 0 && color.r <= 255, 'r within byte range');
  });

  test('different artwork produces different derived colors', () => {
    const red = sampleImageData(solidImageData(255, 0, 0));
    const green = sampleImageData(solidImageData(0, 255, 0));
    assert.ok(red && green, 'both sample colors');
    assert.notStrictEqual(`${red.r},${red.g},${red.b}`, `${green.r},${green.g},${green.b}`);
  });

  test('background follows currentTrack: ambient key changes with track/artwork', () => {
    const trackA = { id: 1, title: 'A' };
    const trackB = { id: 2, title: 'B' };
    const artA = resolveArtworkUrl(trackA);
    const artB = resolveArtworkUrl(trackB);
    assert.notStrictEqual(ambientKey(trackA, artA), ambientKey(trackB, artB), 'different tracks differ');
    assert.strictEqual(ambientKey(trackA, artA), ambientKey(trackA, artA), 'same track is stable');
  });

  test('same track identity + artwork reuses a stable key (cached, no re-extraction)', () => {
    const track = { id: 7, coverUrl: 'https://cdn/x.jpg' };
    assert.strictEqual(ambientKey(track, 'https://cdn/x.jpg'), ambientKey(track, 'https://cdn/x.jpg'));
  });

  test('missing artwork uses safe fallback background', () => {
    const fallback = buildFallbackBackground();
    assert.ok(fallback.includes('radial-gradient'), 'fallback is a radial gradient');
    assert.ok(!/\bundefined\b|\bNaN\b/.test(fallback), 'fallback has no undefined/NaN');
    assert.ok(FALLBACK_AMBIENT_COLOR !== '#000000', 'fallback is not a pure black flash');
  });

  test('transparent artwork yields no color (extraction-safe null)', () => {
    assert.strictEqual(sampleImageData(solidImageData(0, 0, 0, 0)), null);
  });

  test('dark artwork still yields a safe derived color (average fallback)', () => {
    const dark = sampleImageData(solidImageData(8, 8, 8));
    assert.ok(dark, 'dark artwork still produces a color, not null');
  });

  test('buildAmbientGradient embeds the derived color as an ambient wash', () => {
    const gradient = buildAmbientGradient('rgb(128, 40, 20)');
    assert.ok(gradient.includes('rgb(128, 40, 20)'), 'derived color is the accent stop');
    assert.ok(gradient.includes('radial-gradient'), 'ambient gradient type');
    assert.ok(!gradient.includes('url('), 'does NOT background-image the artwork itself');
  });

  test('color extraction only runs on artwork/track change (effect deps, not progress)', async () => {
    const ep = await readSource('components/ExpandedPlayer.jsx');

    // The derivation lives in a useEffect keyed on currentTrack + artUrl.
    assert.ok(/useEffect\(\(\) => \{/.test(ep), 'ambient effect present');
    assert.ok(/}, \[currentTrack, artUrl\]\);/.test(ep), 'effect deps = currentTrack/artUrl (not progress)');

    // The effect must only touch the background, never playback.
    const effectStart = ep.indexOf('const [ambientBg');
    const effectEnd = ep.indexOf('}, [currentTrack, artUrl]);');
    const effectRegion = ep.slice(effectStart, effectEnd);
    assert.ok(!/togglePlay|\.seek\(|playTrack|nextTrack|prevTrack|audioRef|currentTime/.test(effectRegion), 'ambient effect never touches playback/progress');

    // Extraction is fed by its own cross-origin-safe Image, not <img onLoad>.
    assert.ok(!/handleArtworkLoad/.test(ep), 'onLoad-based extraction removed');
    assert.ok(/img\.crossOrigin = 'anonymous'/.test(ep), 'crossOrigin prevents canvas taint in WebView');
  });

  test('transition does not reset playback: CSS only transitions background', async () => {
    const css = await readSource('styles/index.css');
    const block = css.slice(css.indexOf('.ambient-bg-transition'), css.indexOf('}', css.indexOf('.ambient-bg-transition')));
    assert.ok(/transition:\s*background\s*600ms/.test(block), 'transition targets background only');
  });

  test('scrubber stays RED with WHITE thumb (visual pass preserved)', async () => {
    const ep = await readSource('components/ExpandedPlayer.jsx');
    assert.ok(/bg-yt-red/.test(ep), 'played portion remains red');
    assert.ok(/rounded-full bg-white\b/.test(ep), 'thumb remains white');
  });
});