import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scanLibrary, getScanStatus } from '../scanner.js';
import { getAllTracks, rawRun } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDir = path.join(__dirname, '../test_music');

// Helper to construct minimal valid MP3 frame header (0xFF 0xFB) so it's readable
function createMinimalMp3File(filePath) {
  const mp3Header = Buffer.from([
    0xFF, 0xFB, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);
  fs.writeFileSync(filePath, mp3Header);
}

console.log('=== Running Library Scanner Verification ===');

try {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  // Create 5 fake audio files across subfolders
  const subFolder1 = path.join(testDir, 'Artist_Alpha', 'Album_One');
  fs.mkdirSync(subFolder1, { recursive: true });

  createMinimalMp3File(path.join(subFolder1, '01_Track_One.mp3'));
  createMinimalMp3File(path.join(subFolder1, '02_Track_Two.flac'));
  createMinimalMp3File(path.join(testDir, 'Single_Track.m4a'));
  createMinimalMp3File(path.join(testDir, 'Wave_Track.wav'));

  // Create a corrupt/unreadable file (e.g. zero byte file or unreadable permission)
  const corruptFilePath = path.join(testDir, 'Corrupt_Track.mp3');
  fs.writeFileSync(corruptFilePath, 'NOT_A_VALID_AUDIO_HEADER_JUST_GARBAGE');

  console.log(`✓ Created test music folder with 5 audio files (including 1 corrupt file).`);

  // Run scan
  await scanLibrary(testDir);

  const status = getScanStatus();
  console.log('✓ Scanner status after run:', status);

  if (status.scannedCount !== 5) {
    throw new Error(`Expected scannedCount 5, got ${status.scannedCount}`);
  }

  const tracks = await getAllTracks();
  console.log(`✓ Database tracks populated. Total rows in DB: ${tracks.length}`);

  tracks.forEach(t => {
    console.log(`   - Track ID: ${t.id} | Title: "${t.title}" | Format: ${t.format} | File: ${path.basename(t.file_path)}`);
  });

  // Verify deletion reconciliation: delete 1 file and re-scan
  fs.unlinkSync(path.join(subFolder1, '01_Track_One.mp3'));
  console.log('✓ Deleted 01_Track_One.mp3 from disk to test deletion reconciliation.');

  await scanLibrary(testDir);

  const updatedTracks = await getAllTracks();
  console.log(`✓ Database tracks after deletion re-scan: ${updatedTracks.length}`);

  const deletedTrack = updatedTracks.find(t => t.file_path.endsWith('01_Track_One.mp3'));
  if (deletedTrack) {
    throw new Error('Deleted track was not removed from DB during reconciliation!');
  }
  console.log('✓ Verified missing file was successfully removed from DB.');

  // Cleanup test music folder & DB tracks
  fs.rmSync(testDir, { recursive: true, force: true });
  await rawRun(`DELETE FROM tracks WHERE file_path LIKE ?`, [`%test_music%`]);
  console.log('✓ Cleaned up test music files and DB rows.');

  console.log('\n✅ Scanner verification PASSED successfully!');
  process.exit(0);
} catch (err) {
  console.error('\n❌ Scanner verification FAILED:', err);
  process.exit(1);
}
