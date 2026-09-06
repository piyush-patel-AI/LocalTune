import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  shuffleArray,
  shuffleUpcoming,
  nextPlaybackAfterEnd,
} from '../services/playerModes.js';

const readSource = (relPath) =>
  readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');

const ids = (arr) => arr.map((t) => t.id);
const mk = (count, prefix = 'T') =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i + 1}`, title: `${prefix}${i + 1}` }));

const PLAYER = 'context/PlayerContext.jsx';
const EXPANDED = 'components/ExpandedPlayer.jsx';
const MODES = 'services/playerModes.js';

describe('Repeat modes — end-of-track decision', () => {
  test('REPEAT OFF advances normally through the queue', () => {
    const q = mk(3);
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'off', queue: q, queueIndex: 0 }), { action: 'advance', index: 1 });
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'off', queue: q, queueIndex: 1 }), { action: 'advance', index: 2 });
  });

  test('REPEAT ONE stays on the current track at any queue position', () => {
    const q = mk(3);
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'one', queue: q, queueIndex: 0 }), { action: 'replay' });
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'one', queue: q, queueIndex: 2 }), { action: 'replay' });
    // Repeat-one wins even when shuffle is on — no queue progression.
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'one', queue: q, queueIndex: 1, shuffleEnabled: true }), { action: 'replay' });
  });

  test('REPEAT QUEUE wraps after the final track without shuffleing', () => {
    const q = mk(4);
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'queue', queue: q, queueIndex: 3 }), { action: 'wrap', shuffle: false });
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'queue', queue: q, queueIndex: 0 }), { action: 'advance', index: 1 });
  });

  test('empty queue never wraps or advances (falls to autoplay path)', () => {
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'off', queue: [], queueIndex: -1 }), { action: 'autoplay' });
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'queue', queue: [], queueIndex: -1 }), { action: 'autoplay' });
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'one', queue: [], queueIndex: -1 }), { action: 'replay' });
  });

  test('one-track and two-track queues wrap correctly', () => {
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'queue', queue: mk(1), queueIndex: 0 }), { action: 'wrap', shuffle: false });
    assert.deepEqual(nextPlaybackAfterEnd({ repeatMode: 'queue', queue: mk(2), queueIndex: 1 }), { action: 'wrap', shuffle: false });
  });
});

describe('Shuffle behavior', () => {
  test('shuffleArray returns a permutation with no duplicate IDs', () => {
    const q = mk(100);
    for (let i = 0; i < 10; i++) {
      const out = shuffleArray(q);
      assert.strictEqual(out.length, q.length, 'length preserved');
      assert.strictEqual(new Set(ids(out)).size, q.length, 'no duplicates');
      assert.deepEqual([...ids(out)].sort(), [...ids(q)].sort(), 'same track set');
    }
  });

  test('shuffleUpcoming keeps the currently playing track (head) untouched', () => {
    const q = mk(6);
    const out = shuffleUpcoming(q, 2);
    assert.deepEqual(ids(out.slice(0, 3)), ['T1', 'T2', 'T3'], 'current + prior items unchanged');
    assert.strictEqual(new Set(ids(out)).size, 6, 'no duplicates introduced');
    assert.deepEqual([...ids(out)].sort(), [...ids(q)].sort(), 'permutation of the whole queue');
  });

  test('shuffle actually changes the upcoming order', () => {
    const tail = mk(5, 'T');
    let differs = false;
    for (let i = 0; i < 50; i++) {
      if (ids(shuffleArray(tail)).join() !== ids(tail).join()) {
        differs = true;
        break;
      }
    }
    assert.ok(differs, 'upcoming order randomizes across successive shuffles');
  });

  test('shuffle + repeat queue keeps the same queue size across repeated wrap cycles (no growth, no dupes)', () => {
    const q = mk(5);
    assert.deepEqual(
      nextPlaybackAfterEnd({ repeatMode: 'queue', queue: q, queueIndex: 4, shuffleEnabled: true }),
      { action: 'wrap', shuffle: true }
    );
    let cycle = q;
    for (let c = 0; c < 3; c++) {
      cycle = shuffleArray(cycle);
      assert.strictEqual(cycle.length, q.length, `cycle ${c} length stable`);
      assert.strictEqual(new Set(ids(cycle)).size, q.length, `cycle ${c} has no duplicates`);
    }
  });

  test('recommendation-generated tracks can be shuffled into the upcoming pool', () => {
    const queue = mk(2);
    const recTracks = mk(3, 'REC'); // V2 generation pushes these into the queue
    const newQueue = [...queue, ...recTracks];
    assert.strictEqual(new Set(ids(newQueue)).size, 5, 'recommendations append without duplicates');

    const out = shuffleUpcoming(newQueue, 0);
    assert.deepEqual(ids(out.slice(0, 1)), ['T1'], 'current track preserved');
    assert.strictEqual(new Set(ids(out)).size, 5, 'shuffle keeps the rec tracks, no dupes');
    assert.deepEqual([...ids(out)].sort(), [...ids(newQueue)].sort(), 'recommendations included in the pool');
  });
});

describe('PlayerContext wiring (single decision path, no second queue/engine)', () => {
  test('audio ended is resolved through one decision path (nextPlaybackAfterEnd)', async () => {
    const pc = await readSource(PLAYER);
    assert.ok(/const decision = nextPlaybackAfterEnd\(\{ repeatMode, queue, queueIndex, shuffleEnabled \}\);/.test(pc), 'single decision call in ended handler');
    assert.ok(/\s*case 'replay':/.test(pc), 'replay case present');
    assert.ok(/\s*case 'advance':/.test(pc), 'advance case present');
    assert.ok(/\s*case 'wrap':/.test(pc), 'wrap case present');
  });

  test('REPEAT ONE replay restarts the same track and does NOT request a recommendation', async () => {
    const pc = await readSource(PLAYER);
    const replayCase = pc.slice(pc.indexOf("case 'replay':"), pc.indexOf("case 'advance':"));
    assert.ok(/audio\.currentTime = 0/.test(replayCase), 'restarts from 0');
    assert.ok(/audio\.play\(\)/.test(replayCase), 'resumes playback');
    assert.ok(!/nextTrack|getAutoplayTracks/.test(replayCase), 'replay never advances or fetches recommendations');
  });

  test('REPEAT QUEUE wrap preserves queue size (no concat/append) in the ended path', async () => {
    const pc = await readSource(PLAYER);
    const wrapCase = pc.slice(pc.indexOf("case 'wrap':"), pc.indexOf('default:'));
    assert.ok(/shuffleArray\(queue\)/.test(wrapCase), 'wrap reshuffles in place when shuffle is on');
    assert.ok(!/\.concat|\.\.\.queue, \.\.\.|= \[\.\.\.queue,/.test(wrapCase), 'wrap never grows the queue');
    assert.ok(!/getAutoplayTracks/.test(wrapCase), 'wrap never requests recommendations');
  });

  test('next/previous keep index stepping intact with shuffle enabled', async () => {
    const pc = await readSource(PLAYER);
    assert.ok(/setQueueIndex\(nextIdx\)/.test(pc), 'next advances queueIndex');
    assert.ok(/setQueueIndex\(prevIdx\)/.test(pc), 'previous steps queueIndex back');
    assert.ok(/shuffleUpcoming\(newQueue, index\)/.test(pc), 'shuffle only permutes the upcoming slice in playTrack');
  });

  test('shuffle toggling snapshots base order and only randomizes upcoming', async () => {
    const pc = await readSource(PLAYER);
    assert.ok(/originalQueueRef\.current = \[\.\.\.queue\]/.test(pc), 'base order snapshot on enable');
    assert.ok(/setQueue\(shuffleUpcoming\(queue, queueIndex\)\)/.test(pc), 'enable shuffles only upcoming');
const offBlock = pc.indexOf('setShuffleEnabled(false);');
    const restore = pc.slice(offBlock, pc.indexOf('});', offBlock));
    assert.ok(/originalQueueRef.current/.test(restore), 'off restores the base order');
    assert.ok(/currentTrack/.test(restore), 'off keeps the current track positioned');
  });

  test('repeat state cycles off → queue → one → off', async () => {
    const pc = await readSource(PLAYER);
    assert.ok(/setRepeatMode\(\(mode\) => \(mode === 'off' \? 'queue' : mode === 'queue' \? 'one' : 'off'\)\)/.test(pc), 'three-state cycle');
  });

  test('context exposes repeatMode/shuffleEnabled/cycleRepeat/toggleShuffle', async () => {
    const pc = await readSource(PLAYER);
    const providerRegion = pc.slice(pc.indexOf('<PlayerContext.Provider'));
    for (const key of ['repeatMode,', 'shuffleEnabled,', 'cycleRepeat,', 'toggleShuffle,']) {
      assert.ok(providerRegion.includes(key), `${key.trim()} exposed to consumers`);
    }
  });

  test('player modes module is used by PlayerContext (no second implementation)', async () => {
    const pc = await readSource(PLAYER);
    const modes = await readSource(MODES);
    assert.ok(pc.includes("from '../services/playerModes.js'"), 'imports shared playerModes module');
    assert.ok(modes.includes('export function shuffleArray'), 'shuffleArray lives in the module');
    assert.ok(modes.includes('export function shuffleUpcoming'), 'shuffleUpcoming lives in the module');
    assert.ok(modes.includes('export function nextPlaybackAfterEnd'), 'nextPlaybackAfterEnd lives in the module');
  });
});

describe('ExpandedPlayer UI wiring (clear state indication)', () => {
  test('Shuffle button calls toggleShuffle and shows active state', async () => {
    const ep = await readSource(EXPANDED);
    assert.ok(/onClick=\{toggleShuffle\}/.test(ep), 'shuffle wired');
    assert.ok(/shuffleEnabled \? 'text-white' : 'text-neutral-400 hover:text-white'/.test(ep), 'active color when on');
    assert.ok(/aria-pressed=\{shuffleEnabled\}/.test(ep), 'pressed state exposed');
  });

  test('Repeat button cycles modes and shows the "1" indicator for repeat-one', async () => {
    const ep = await readSource(EXPANDED);
    assert.ok(/onClick=\{cycleRepeat\}/.test(ep), 'repeat wired');
    assert.ok(/repeatMode !== 'off' \? 'text-white' : 'text-neutral-400 hover:text-white'/.test(ep), 'active color when a repeat mode is on');
    assert.ok(/repeatMode === 'one'/.test(ep) && /Repeat1/.test(ep), 'repeat-one uses the "1" indicator icon');
    assert.ok(/aria-pressed=\{repeatMode !== 'off'\}/.test(ep), 'pressed state exposed');
  });
});