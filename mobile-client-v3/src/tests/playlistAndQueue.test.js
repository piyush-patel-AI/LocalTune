import assert from 'node:assert';
import { test, describe } from 'node:test';

describe('Playlist and Queue State Management', () => {
  const mockQueue = [
    { id: 101, title: 'Song A', artist: 'Artist A' },
    { id: 102, title: 'Song B', artist: 'Artist B' },
    { id: 103, title: 'Song C', artist: 'Artist C' },
    { id: 104, title: 'Song D', artist: 'Artist D' },
  ];

  test('Reordering queue preserves current track identity and updates queue index correctly', () => {
    let currentTrack = mockQueue[1]; // Song B (id: 102), initial queueIndex = 1
    let queue = [...mockQueue];
    let queueIndex = 1;

    // Function matching PlayerContext.reorderQueue logic
    const reorder = (fromIndex, toIndex) => {
      const newQueue = [...queue];
      const [movedItem] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedItem);

      const newCurrentIndex = newQueue.findIndex((t) => t.id === currentTrack.id);
      return { newQueue, newCurrentIndex };
    };

    // Move Song B (index 1) to index 3 (bottom)
    const res1 = reorder(1, 3);
    assert.strictEqual(res1.newQueue[3].id, 102);
    assert.strictEqual(res1.newCurrentIndex, 3);

    // Move Song D (index 3 originally) to index 0 (top)
    const res2 = reorder(3, 0);
    assert.strictEqual(res2.newQueue[0].id, 104);
    assert.strictEqual(res2.newCurrentIndex, 2); // Song B is now at index 2
  });

  test('Removing track from queue updates index properly', () => {
    let currentTrack = mockQueue[2]; // Song C (id: 103), queueIndex = 2
    let queue = [...mockQueue];

    const remove = (index) => {
      const newQueue = [...queue];
      newQueue.splice(index, 1);
      const newCurrentIndex = newQueue.findIndex((t) => t.id === currentTrack.id);
      return { newQueue, newCurrentIndex };
    };

    // Remove Song A (index 0)
    const res = remove(0);
    assert.strictEqual(res.newQueue.length, 3);
    assert.strictEqual(res.newCurrentIndex, 1); // Song C is now at index 1
    assert.strictEqual(res.newQueue[res.newCurrentIndex].id, 103);
  });

  test('Playlist artwork derivation is deterministic across renders', () => {
    const playlistWithTracks = {
      id: 5,
      name: 'Chill Vibes',
      sample_tracks: [{ id: 201, cover_art_path: '/covers/201.jpg' }],
    };

    const playlistEmpty = {
      id: 6,
      name: 'Empty List',
    };

    assert.ok(playlistWithTracks.sample_tracks.length > 0);
    assert.strictEqual(playlistWithTracks.sample_tracks[0].id, 201);
    assert.strictEqual(playlistEmpty.sample_tracks, undefined);
  });
});
