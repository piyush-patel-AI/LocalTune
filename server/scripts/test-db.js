import db, {
  createUser,
  getUserByUsername,
  getUserById,
  upsertTrack,
  getTrackById,
  deleteTrackByPath,
  createPlaylist,
  getUserPlaylists,
  addTrackToPlaylist,
  getPlaylistTracks,
  addFavorite,
  getUserFavorites,
  removeFavorite,
  deletePlaylist
} from '../db.js';

console.log('=== Running Database Schema Verification ===');

try {
  // 1. Insert fake user
  const fakeUsername = `testuser_${Date.now()}`;
  const userId = createUser(fakeUsername, '$2a$10$fakehash', 'Test User');
  console.log(`✓ Inserted fake user with ID: ${userId}`);

  const user = getUserByUsername(fakeUsername);
  if (!user || user.id !== userId) {
    throw new Error('Failed to retrieve inserted user');
  }
  console.log('✓ Retrieved fake user by username:', user.username);

  // 2. Insert fake track
  const fakePath = `/tmp/test_song_${Date.now()}.mp3`;
  const trackId = upsertTrack({
    filePath: fakePath,
    title: 'Test Song',
    artist: 'Test Artist',
    album: 'Test Album',
    durationSeconds: 180,
    format: 'mp3',
    fileSize: 1024000,
    dateModified: new Date().toISOString()
  });
  console.log(`✓ Inserted fake track with ID: ${trackId}`);

  const track = getTrackById(trackId);
  if (!track || track.file_path !== fakePath) {
    throw new Error('Failed to retrieve inserted track');
  }
  console.log('✓ Retrieved fake track by ID:', track.title);

  // 3. Create playlist & add track (testing Foreign Keys)
  const playlistId = createPlaylist(userId, 'My Test Playlist');
  console.log(`✓ Created playlist ID: ${playlistId} for user ID: ${userId}`);

  const added = addTrackToPlaylist(playlistId, userId, trackId);
  if (!added) throw new Error('Failed to add track to playlist');
  console.log('✓ Added track to playlist');

  const playlistTracks = getPlaylistTracks(playlistId, userId);
  if (!playlistTracks || playlistTracks.length !== 1) {
    throw new Error('Playlist tracks count mismatch');
  }
  console.log('✓ Verified playlist track count:', playlistTracks.length);

  // 4. Add favorite
  addFavorite(userId, trackId);
  const favs = getUserFavorites(userId);
  if (!favs || favs.length !== 1) {
    throw new Error('Favorites count mismatch');
  }
  console.log('✓ Verified favorite addition');

  // 5. Cleanup test data
  removeFavorite(userId, trackId);
  deletePlaylist(playlistId, userId);
  deleteTrackByPath(fakePath);
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
  console.log('✓ Cleaned up test data');

  console.log('\n✅ DB Schema and access layer verification PASSED successfully!');
  process.exit(0);
} catch (err) {
  console.error('\n❌ DB Schema verification FAILED:', err);
  process.exit(1);
}
