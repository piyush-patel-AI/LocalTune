/**
 * server/scripts/verify-rekey.js
 *
 * OPTIONAL archive-audit tool (local only). Production does NOT use or
 * require this script: production runs a fresh Turso database initialized
 * from schema.sql + migrations (see scripts/init-turso.js) and builds its
 * library purely from port-5050 uploads.
 *
 * Historical purpose: it was the pre-import gate for importing the legacy
 * localtune.db into Turso. That import path has been retired; the local
 * database and music folder remain untouched on disk as a backup/archive.
 *
 * Still useful for auditing the archive before/after local maintenance:
 *   1. No tracks.file_path values are local filesystem paths anymore
 *      (every row must carry its B2 object key after scanner re-keying).
 *   2. Every cloud-keyed row also has b2_key populated.
 *   3. Referential integrity holds for playlists/favorites/play-history/
 *      transitions/recommendation logs (all of which CASCADE on track delete,
 *      so orphans here would already mean silent data loss).
 *   4. No duplicate title+artist groups exist (the startup cleanup in db.js
 *      deletes those rows — you want to know BEFORE booting a server
 *      against this database).
 *   5. Every local-path row's underlying file still exists on this machine
 *      (a missing file can never be re-keyed by a scan and WILL be deleted —
 *      together with all of its history — by the first reconcile on Render).
 *   6. If B2 credentials are present: cross-check DB keys against the actual
 *      bucket listing (missing objects + orphaned objects).
 *
 * Never writes to the database. Exit code 0 = archive is consistent.
 *
 * Usage: node scripts/verify-rekey.js [--db <path>]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const dbIdx = args.indexOf('--db');
const dbPath = dbIdx !== -1 ? args[dbIdx + 1] : process.env.DB_PATH || path.join(__dirname, '../localtune.db');

if (!fs.existsSync(dbPath)) {
  console.error(`❌ Database not found: ${dbPath}`);
  process.exit(2);
}

let B2;
try { B2 = await import('../b2.js'); } catch { B2 = null; }

const db = new Database(dbPath, { readonly: true });
const one = (sql, ...p) => db.prepare(sql).get(...p)?.c ?? 0;

const failures = [];
const warnings = [];
const ok = (msg) => console.log(`  ✅ ${msg}`);
const bad = (msg) => { failures.push(msg); console.log(`  ❌ ${msg}`); };
const warn = (msg) => { warnings.push(msg); console.log(`  ⚠️  ${msg}`); };

console.log(`\n🔍 Re-key verification for: ${dbPath}\n`);

// --- Overview -------------------------------------------------------------
console.log('── Dataset overview');
for (const t of ['users', 'tracks', 'playlists', 'playlist_tracks', 'favorites', 'play_logs', 'song_transitions', 'recommendation_logs', 'artist_images']) {
  console.log(`   ${t.padEnd(20)} ${one(`SELECT COUNT(*) c FROM ${t}`)}`);
}

// --- 1. Path classes -------------------------------------------------------
console.log('\n── 1. tracks.file_path classification');
const absPaths = one(`SELECT COUNT(*) c FROM tracks WHERE file_path LIKE '/%'`);
const winPaths = one(`SELECT COUNT(*) c FROM tracks WHERE substr(file_path,2,1)=':' `);
const cloudRows = one(`SELECT COUNT(*) c FROM tracks WHERE file_path LIKE 'music/%'`);
const otherRel = one(`SELECT COUNT(*) c FROM tracks WHERE file_path NOT LIKE '/%' AND file_path NOT LIKE 'music/%' AND substr(file_path,2,1) != ':'`);
console.log(`   absolute local paths : ${absPaths}`);
console.log(`   windows paths        : ${winPaths}`);
console.log(`   music/* B2 keys      : ${cloudRows}`);
console.log(`   other/unknown        : ${otherRel}`);

if (absPaths === 0 && winPaths === 0) ok('No local filesystem paths remain — every track is B2-keyed.');
else bad(`${absPaths + winPaths} track(s) still point at local files. Run POST /api/scan on the machine that has them (MUSIC_DIR must cover their folders) before importing.`);

// --- 2. b2_key coverage ----------------------------------------------------
console.log('\n── 2. b2_key column coverage');
const nullKeys = one(`SELECT COUNT(*) c FROM tracks WHERE file_path LIKE 'music/%' AND (b2_key IS NULL OR b2_key = '')`);
if (cloudRows > 0 && nullKeys === 0) ok('All cloud-keyed rows carry b2_key.');
else if (cloudRows === 0) warn('No music/* rows yet — nothing uploaded/re-keyed.');
else bad(`${nullKeys} music/* row(s) missing b2_key.`);

// --- 3. Referential integrity ----------------------------------------------
console.log('\n── 3. Referential integrity (track references)');
const fkChecks = [
  ['playlist_tracks', 'SELECT COUNT(*) c FROM playlist_tracks pt LEFT JOIN tracks t ON pt.track_id=t.id WHERE t.id IS NULL'],
  ['favorites', 'SELECT COUNT(*) c FROM favorites f LEFT JOIN tracks t ON f.track_id=t.id WHERE t.id IS NULL'],
  ['play_logs', 'SELECT COUNT(*) c FROM play_logs p LEFT JOIN tracks t ON p.track_id=t.id WHERE t.id IS NULL'],
  ['song_transitions.from_track_id', 'SELECT COUNT(*) c FROM song_transitions s LEFT JOIN tracks t ON s.from_track_id=t.id WHERE t.id IS NULL'],
  ['song_transitions.to_track_id', 'SELECT COUNT(*) c FROM song_transitions s LEFT JOIN tracks t ON s.to_track_id=t.id WHERE t.id IS NULL']
];
for (const [name, sql] of fkChecks) {
  const c = one(sql);
  if (c === 0) ok(`${name}: 0 orphans`);
  else bad(`${name}: ${c} orphan(s) — these references are already dangling.`);
}
const plOrphans = one('SELECT COUNT(*) c FROM playlist_tracks pt LEFT JOIN playlists p ON pt.playlist_id=p.id WHERE p.id IS NULL');
plOrphans === 0 ? ok('playlist_tracks→playlists: 0 orphans') : bad(`playlist_tracks→playlists: ${plOrphans} orphan(s)`);

// --- 4. Duplicate groups (startup cleanup food) ------------------------------
console.log('\n── 4. Duplicate title+artist groups');
const dupGroups = one(`SELECT COUNT(*) c FROM (SELECT 1 FROM tracks GROUP BY LOWER(TRIM(title)), LOWER(TRIM(artist)) HAVING COUNT(*) > 1)`);
if (dupGroups === 0) ok('None — the automatic startup cleanup will not delete anything.');
else warn(`${dupGroups} group(s) found. Booting ANY server against this DB auto-deletes duplicates (keeping MIN(id)) and their B2 objects. Review first: SELECT id,title,artist,file_path FROM tracks ORDER BY LOWER(TRIM(title)),LOWER(TRIM(artist)),id;`);

// --- 5. Local files still reachable? ----------------------------------------
console.log('\n── 5. Local files backing unmigrated rows');
const localRows = db.prepare(`SELECT id, file_path FROM tracks WHERE file_path LIKE '/%' OR substr(file_path,2,1)=':'`).all();
const missingFiles = localRows.filter((r) => !fs.existsSync(r.file_path));
if (localRows.length === 0) ok('n/a — no local rows.');
else if (missingFiles.length === 0) ok(`All ${localRows.length} local file(s) exist on this machine and can be ingested by a scan.`);
else {
  bad(`${missingFiles.length} local row(s) point at MISSING files — a scan can never migrate these, and the FIRST reconcile from Render will DELETE them plus (via CASCADE) their playlists/favorites/history:`);
  missingFiles.slice(0, 10).forEach((r) => console.log(`     track #${r.id}: ${r.file_path}`));
}

// --- 6. B2 bucket cross-check (only with credentials) ------------------------
console.log('\n── 6. B2 bucket cross-check');
if (!B2 || !B2.isB2Configured()) {
  warn('Skipped — B2 credentials not configured in this environment. Re-run on the machine holding .env to validate keys against the live bucket.');
} else {
  const objects = await B2.listB2Objects('');
  const keySet = new Set(objects.map((o) => o.key));
  const audioRows = db.prepare(`SELECT id, file_path FROM tracks WHERE file_path LIKE 'music/%'`).all();
  const missingInBucket = audioRows.filter((r) => !keySet.has(r.file_path));
  if (audioRows.length === 0) warn('No keyed rows to check.');
  else if (missingInBucket.length === 0) ok(`All ${audioRows.length} DB keys exist in the bucket.`);
  else {
    bad(`${missingInBucket.length} DB row(s) reference keys NOT present in the bucket (streaming will 404):`);
    missingInBucket.slice(0, 10).forEach((r) => console.log(`     track #${r.id}: ${r.file_path}`));
  }
  const dbAudioKeys = new Set(audioRows.map((r) => r.file_path));
  const artworkKeys = new Set(db.prepare(`SELECT DISTINCT artwork_b2_key k FROM tracks WHERE artwork_b2_key IS NOT NULL`).all().map((r) => r.k));
  const artistImgKeys = new Set(db.prepare(`SELECT DISTINCT b2_key k FROM artist_images WHERE b2_key IS NOT NULL`).all().map((r) => r.k));
  const orphans = objects.filter((o) => !dbAudioKeys.has(o.key) && !artworkKeys.has(o.key) && !artistImgKeys.has(o.key) && !o.key.startsWith('avatars/'));
  if (orphans.length === 0) ok('No orphaned audio/artwork objects in bucket.');
  else warn(`${orphans.length} object(s) in bucket are not referenced by the DB (duplicate uploads or leftovers). Safe to ignore; review before deleting:\n     ${orphans.slice(0, 8).map((o) => o.key).join('\n     ')}`);
}

db.close();

console.log('\n────────────────────────────────────────────');
if (failures.length > 0) {
  console.log(`❌ NOT READY FOR TURSO IMPORT — ${failures.length} blocking issue(s), ${warnings.length} warning(s).`);
  process.exit(1);
}
console.log(`✅ READY FOR TURSO IMPORT${warnings.length ? ` — with ${warnings.length} warning(s)` : ''}.`);
console.log('   Next: PRAGMA wal_checkpoint(TRUNCATE) → turso db import → set TURSO_* env on Render.');
process.exit(0);
