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

  test('seekto handler moves audio without touching the polyfill-owned localTuneBridge', async () => {
    const pc = await readSource('context/PlayerContext.jsx');
    assert.ok(
      !/localTuneBridge|octaveBridge|AndroidMediaBridge/.test(pc),
      'V3 relies on browser Media Session only; the native bridge stays app-injected'
    );
  });
});