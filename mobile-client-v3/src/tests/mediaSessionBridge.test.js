import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFile } from 'node:fs/promises';

const readSource = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');

describe('Android MediaSession bridge contract (Octave polyfill)', () => {
  test('audio element is mounted in the DOM so the polyfill heartbeat can observe it', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    assert.ok(/useRef\(null\)/.test(pc), 'audioRef starts null (filled by mounted element)');
    assert.ok(!/useRef\(new Audio\(\)\)/.test(pc), 'no detached Audio element');
    assert.ok(/<audio ref=\{audioRef\} preload="auto" style=\{\{ display: 'none' \}\} \/>/.test(pc), 'audio rendered in the provider DOM');
  });

  test('metadata exposes title/artist/album/artwork to navigator.mediaSession', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    assert.ok(/navigator\.mediaSession\.metadata = new MediaMetadata\(\{/.test(pc), 'MediaMetadata set');
    assert.ok(/title: currentTrack\.title \|\| 'Unknown Track'/.test(pc), 'title field');
    assert.ok(/artist: currentTrack\.artist \|\| 'Unknown Artist'/.test(pc), 'artist field');
    assert.ok(/album: currentTrack\.album \|\| 'LocalTune'/.test(pc), 'album field');

    assert.ok(
      /src: currentTrack\.coverUrl \|\| currentTrack\.cover_art_url \|\| api\.getTrackArtUrl\(currentTrack\.id\)/.test(pc),
      'artwork src resolves via coverUrl/cover_art_url/getTrackArtUrl'
    );
    assert.ok(/sizes: '512x512'/.test(pc), 'artwork has a size for the native loader');
  });

  test('action handlers are registered for all transport commands', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    for (const action of ['play', 'pause', 'previoustrack', 'nexttrack', 'seekto']) {
      assert.ok(
        new RegExp(`setActionHandler\\('${action}'`).test(pc),
        `${action} action handler registered`
      );
    }

    const seektoRegion = pc.slice(pc.indexOf("setActionHandler('seekto'"), pc.indexOf('}, [currentTrack]);'));
    assert.ok(/details\.seekTime/.test(seektoRegion), 'seekto reads details.seekTime');
    assert.ok(/audioRef\.current\.currentTime = details\.seekTime/.test(seektoRegion), 'seekto moves the HTML5 audio position');
  });

  test('playbackState is derived from V3 isPlaying state (polyfill hook path)', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    assert.ok(
      /navigator\.mediaSession\.playbackState = isPlaying \? 'playing' : 'paused'/.test(pc),
      'playbackState pushed on play/pause (isPlaying)'
    );
    assert.ok(
      /}, \[currentTrack, isPlaying\]\);/.test(pc),
      'playbackState effect keyed on currentTrack + isPlaying'
    );
    assert.ok(
      /!currentTrack \|\| !\('mediaSession' in navigator\)/.test(pc),
      'mediaSession calls guarded on support'
    );
  });

  test('position/duration synchronized via setPositionState while playing', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    assert.ok(
      /navigator\.mediaSession\.setPositionState\(\{/.test(pc),
      'setPositionState drives position/duration'
    );
    assert.ok(/const duration = Number\.isFinite\(audio\.duration\) \? audio\.duration : 0/.test(pc), 'guards NaN duration');
    assert.ok(/const position = Number\.isFinite\(audio\.currentTime\) \? audio\.currentTime : 0/.test(pc), 'guards NaN position');
    assert.ok(/position < 0 \|\| position > duration\) return;/.test(pc), 'position clamped to track bounds');
    assert.ok(/playbackRate: audio\.playbackRate \|\| 1/.test(pc), 'playback rate forwarded');

    const region = pc.slice(pc.indexOf('useEffect(() => {'), pc.lastIndexOf('}, [currentTrack, isPlaying]);'));
    assert.ok(/setInterval\(syncPosition, 1000\)/.test(region), 'position synced once per second while playing');
  });

  test('seekto handler moves audio and never redefines the polyfill-owned bridge globals', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    // V3 must not overwrite the app-injected command bridge (single bridge rule).
    assert.ok(!/window\.localTuneBridge\s*=/.test(pc), 'does not redefine localTuneBridge');
    assert.ok(!/window\.octaveBridge\s*=/.test(pc), 'does not redefine octaveBridge alias');
  });

  test('persistent polyfill fallback buttons (aria-label Next/Previous) are mounted', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    assert.ok(
      /<button type="button" aria-label="Next" onClick=\{nextTrack\} \/>/.test(pc),
      'hidden Next button wired to PlayerContext.nextTrack'
    );
    assert.ok(
      /<button type="button" aria-label="Previous" onClick=\{prevTrack\} \/>/.test(pc),
      'hidden Previous button wired to PlayerContext.prevTrack'
    );
  });

  test('PlayerContext directly pushes real metadata to the existing native bridge', async () => {
    const pc = await readSource('context/PlayerContext.jsx');

    assert.ok(
      /pushTrackMetadata\(\{/.test(pc),
      'metadata pushed through the shared native bridge driver'
    );
    assert.ok(/title: currentTrack\.title \|\| 'Unknown Track'/.test(pc), 'uses real track title');
    assert.ok(/artist: currentTrack\.artist \|\| 'Unknown Artist'/.test(pc), 'uses real track artist');
    assert.ok(/album: currentTrack\.album \|\| 'LocalTune'/.test(pc), 'uses real track album');
    assert.ok(/artwork: resolveArtworkUrl\(currentTrack\)/.test(pc), 'artwork resolved from the track');
    assert.ok(/}, \[currentTrack, duration\]\);/.test(pc), 'metadata re-pushed on track/duration change');
  });

  test('PlayerContext pushes play/pause state to the existing native bridge', async () => {
    const pc = await readSource('context/PlayerContext.jsx');
    assert.ok(/pushPlaybackState\(isPlaying, position, trackDuration\)/.test(pc), 'playback pushed');
    assert.ok(/}, \[currentTrack, isPlaying\]\);/.test(pc), 'playback pushed on track/play state change');
  });
});

describe('Native bridge driver (services/nativeBridge.js)', () => {
  const savedGlobal = globalThis.window;
  const savedAndroid = globalThis.AndroidMediaBridge;

  function withBridge(overrides = {}) {
    const calls = [];
    const bridge = {
      updateMetadata: (...args) => calls.push(['updateMetadata', args]),
      updatePlaybackState: (...args) => calls.push(['updatePlaybackState', args]),
      logDebug: (...args) => calls.push(['logDebug', args]),
      ...overrides,
    };
    globalThis.window = { AndroidMediaBridge: bridge };
    return { bridge, calls };
  }

  test('availability tracks the AndroidMediaBridge JS interface', async () => {
    const { isNativeBridgeAvailable } = await import('../services/nativeBridge.js');
    globalThis.window = undefined;
    assert.equal(isNativeBridgeAvailable(), false, 'no bridge in plain browser');
    withBridge();
    assert.equal(isNativeBridgeAvailable(), true, 'bridge present in Octave WebView');
  });

  test('pushTrackMetadata forwards exact AndroidMediaBridge.updateMetadata arguments', async () => {
    const { pushTrackMetadata } = await import('../services/nativeBridge.js');
    const { calls } = withBridge();
    const ok = pushTrackMetadata({
      title: 'My Song',
      artist: 'My Artist',
      album: 'My Album',
      artwork: 'https://x/api/tracks/7/art',
      duration: 245.5,
    });
    assert.equal(ok, true);
    assert.deepEqual(calls[0][0], 'updateMetadata');
    assert.deepEqual(calls[0][1], ['My Song', 'My Artist', 'My Album', 'https://x/api/tracks/7/art', 245.5]);
  });

  test('pushPlaybackState forwards exact AndroidMediaBridge.updatePlaybackState arguments', async () => {
    const { pushPlaybackState } = await import('../services/nativeBridge.js');
    const { calls } = withBridge();
    assert.equal(pushPlaybackState(true, 42.5, 245.5), true);
    assert.deepEqual(calls[0][0], 'updatePlaybackState');
    assert.deepEqual(calls[0][1], [true, 42.5, 245.5]);
  });

  test('logToNative forwards to AndroidMediaBridge.logDebug', async () => {
    const { logToNative } = await import('../services/nativeBridge.js');
    const { calls } = withBridge();
    assert.equal(logToNative('V3 metadata pushed'), true);
    assert.deepEqual(calls[0][0], 'logDebug');
    assert.deepEqual(calls[0][1], ['V3 metadata pushed']);
  });

  test('no-throw no-op when the bridge interface is absent', async () => {
    const { pushTrackMetadata, pushPlaybackState, logToNative } = await import('../services/nativeBridge.js');
    globalThis.window = undefined;
    assert.equal(pushTrackMetadata({ title: 'S' }), false);
    assert.equal(pushPlaybackState(false, 0, 0), false);
    assert.equal(logToNative('x'), false);
  });

  test('falls back to globalThis.AndroidMediaBridge when window is populated differently', async () => {
    const { pushTrackMetadata } = await import('../services/nativeBridge.js');
    const calls = [];
    globalThis.window = undefined;
    globalThis.AndroidMediaBridge = { updateMetadata: (...a) => calls.push(a) };
    assert.equal(pushTrackMetadata({ title: 'S', artist: 'A', album: 'B', artwork: 'C' }), true);
    assert.deepEqual(calls[0], ['S', 'A', 'B', 'C', 0]);
  });

  test('restores global state', () => {
    globalThis.window = savedGlobal;
    globalThis.AndroidMediaBridge = savedAndroid;
  });
});