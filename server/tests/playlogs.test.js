import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('playlogs');
const {
  createUser, upsertTrack, logPlayEvent,
  getPlayLogsForUser, getTransitionsForUser
} = await import('../db.js');

async function mkTrack(p) {
  return upsertTrack({
    filePath: p, title: p, artist: 'Log Artist', album: 'LA',
    durationSeconds: 100, format: 'mp3', fileSize: 10,
    dateModified: new Date().toISOString()
  });
}

test('full listen logs completion_ratio 1 and no skip', async () => {
  const userId = await createUser('log_user', 'h', 'Logger');
  const t = await mkTrack('music/log/full.mp3');

  await logPlayEvent({ userId, trackId: t, listenedSeconds: 100, durationSeconds: 100 });
  const [log] = await getPlayLogsForUser(userId);
  assert.equal(log.completion_ratio, 1);
  assert.equal(log.is_skip, 0);
  assert.equal(log.is_replay, 0);
  assert.ok(Number.isInteger(log.hour_of_day));
});

test('quick abandon is classified as a skip', async () => {
  const userId = await createUser('skip_user', 'h', 'Skipper');
  const t = await mkTrack('music/log/skip.mp3');
  await logPlayEvent({ userId, trackId: t, listenedSeconds: 4, durationSeconds: 200 });
  const [log] = await getPlayLogsForUser(userId);
  assert.equal(log.is_skip, 1);
});

test('transitions increment per (user, from, to) pair; self-transitions ignored', async () => {
  const userId = await createUser('trans_user', 'h', 'Trans');
  const a = await mkTrack('music/log/a.mp3');
  const b = await mkTrack('music/log/b.mp3');

  await logPlayEvent({ userId, trackId: b, listenedSeconds: 90, durationSeconds: 100, previousTrackId: a });
  await logPlayEvent({ userId, trackId: b, listenedSeconds: 90, durationSeconds: 100, previousTrackId: a });
  await logPlayEvent({ userId, trackId: b, listenedSeconds: 90, durationSeconds: 100, previousTrackId: b }); // ignored

  const trans = await getTransitionsForUser(userId);
  assert.equal(trans.length, 1, 'one transition row');
  assert.equal(trans[0].from_track_id, a);
  assert.equal(trans[0].to_track_id, b);
  assert.equal(trans[0].transition_count, 2);
});
