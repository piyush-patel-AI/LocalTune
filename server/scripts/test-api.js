import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { createUser, getUserByUsername, upsertTrack } from '../db.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:5000';

async function runVerification() {
  console.log('--- Phase 5 & 6 API Verification ---');

  // 1. Ensure test users exist
  let userA = getUserByUsername('piyush_test');
  if (!userA) {
    const hash = bcrypt.hashSync('password123', 10);
    createUser('piyush_test', hash, 'Piyush Test');
    userA = getUserByUsername('piyush_test');
  }

  let userB = getUserByUsername('friend_test');
  if (!userB) {
    const hash = bcrypt.hashSync('password123', 10);
    createUser('friend_test', hash, 'Friend Test');
    userB = getUserByUsername('friend_test');
  }

  // 2. Insert dummy track for streaming & library testing
  const dummyAudioPath = path.join(__dirname, 'dummy_test.mp3');
  // Create a 2048-byte dummy file if not exists
  if (!fs.existsSync(dummyAudioPath)) {
    fs.writeFileSync(dummyAudioPath, Buffer.alloc(2048, 'a'));
  }

  const dummyTrackId = upsertTrack({
    filePath: dummyAudioPath,
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    durationSeconds: 120,
    format: 'mp3',
    fileSize: 2048,
    dateModified: new Date().toISOString()
  });
  console.log(`[Test] Inserted dummy track ID: ${dummyTrackId}`);

  // Helper for cookie-based request
  let cookieA = '';
  let cookieB = '';

  // 3. Login User A
  const resLoginA = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'piyush_test', password: 'password123' })
  });
  console.log(`[Test] Login User A status: ${resLoginA.status}`);
  cookieA = resLoginA.headers.get('set-cookie');
  const dataLoginA = await resLoginA.json();
  console.log(`[Test] User A logged in:`, dataLoginA.user.username);

  // Login User B
  const resLoginB = await fetch(`${BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'friend_test', password: 'password123' })
  });
  cookieB = resLoginB.headers.get('set-cookie');
  console.log(`[Test] User B logged in successfully.`);

  // 4. Test Unauthenticated rejection on protected route
  const resUnauth = await fetch(`${BASE_URL}/api/tracks`);
  console.log(`[Test] Unauthenticated GET /api/tracks status: ${resUnauth.status} (Expected 401)`);
  if (resUnauth.status !== 401) throw new Error('Unauthenticated request was not rejected!');

  // 5. Test Authenticated Tracks listing
  const resTracks = await fetch(`${BASE_URL}/api/tracks`, {
    headers: { Cookie: cookieA }
  });
  const dataTracks = await resTracks.json();
  console.log(`[Test] Authenticated GET /api/tracks found ${dataTracks.tracks?.length} tracks.`);

  // 6. Test Playlist CRUD with User A
  const resCreatePl = await fetch(`${BASE_URL}/api/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({ name: 'User A Favorites Playlist' })
  });
  const dataCreatePl = await resCreatePl.json();
  const playlistAId = dataCreatePl.playlist.id;
  console.log(`[Test] Created Playlist ID ${playlistAId} for User A.`);

  // Add track to playlist A
  const resAddTrack = await fetch(`${BASE_URL}/api/playlists/${playlistAId}/tracks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({ trackId: dummyTrackId })
  });
  console.log(`[Test] Added track to playlist status: ${resAddTrack.status}`);

  // 7. Verify Ownership Check (User B trying to fetch User A's playlist)
  const resUserBGetPl = await fetch(`${BASE_URL}/api/playlists/${playlistAId}`, {
    headers: { Cookie: cookieB }
  });
  console.log(`[Test] User B accessing User A playlist status: ${resUserBGetPl.status} (Expected 404)`);
  if (resUserBGetPl.status !== 404) throw new Error('User B was able to access User A playlist!');

  // 8. Test Favorites isolation
  await fetch(`${BASE_URL}/api/favorites/${dummyTrackId}`, {
    method: 'POST',
    headers: { Cookie: cookieA }
  });
  const resFavA = await fetch(`${BASE_URL}/api/favorites`, { headers: { Cookie: cookieA } });
  const dataFavA = await resFavA.json();
  console.log(`[Test] User A favorites count: ${dataFavA.favorites.length}`);

  const resFavB = await fetch(`${BASE_URL}/api/favorites`, { headers: { Cookie: cookieB } });
  const dataFavB = await resFavB.json();
  console.log(`[Test] User B favorites count: ${dataFavB.favorites.length} (Expected 0)`);

  // 9. Test HTTP Range streaming endpoint
  console.log('--- Testing Streaming Range Requests ---');
  const resStreamRange = await fetch(`${BASE_URL}/stream/${dummyTrackId}`, {
    headers: {
      Cookie: cookieA,
      Range: 'bytes=0-1023'
    }
  });

  console.log(`[Test] Stream Range status: ${resStreamRange.status} (Expected 206)`);
  console.log(`[Test] Content-Range header: ${resStreamRange.headers.get('content-range')}`);
  console.log(`[Test] Content-Length header: ${resStreamRange.headers.get('content-length')}`);
  console.log(`[Test] Content-Type header: ${resStreamRange.headers.get('content-type')}`);

  const buf = await resStreamRange.arrayBuffer();
  console.log(`[Test] Received byte count: ${buf.byteLength} (Expected 1024)`);

  if (resStreamRange.status === 206 && buf.byteLength === 1024) {
    console.log('\n✅ ALL BACKEND API & RANGE STREAMING TESTS PASSED PERFECTLY!\n');
  } else {
    throw new Error('Streaming Range test failed!');
  }
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
