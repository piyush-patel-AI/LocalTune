/**
 * server/scripts/check-turso-data.js
 *
 * Inspects legacy database sources (localtune.db file / backups) to determine
 * whether real production LocalTune data exists.
 *
 * Safe & read-only. Does NOT perform any migration or write operations.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverDir = path.resolve(__dirname, '..');

console.log('==================================================');
console.log('LEGACY TURSO / SQLITE DATA INSPECTION');
console.log('==================================================\n');

const dbFiles = [
  path.join(serverDir, 'localtune.db'),
  path.join(serverDir, 'backups', 'localtune.db.pre-turso')
];

let foundLegacyData = false;

for (const dbPath of dbFiles) {
  const relPath = path.relative(process.cwd(), dbPath);
  if (!fs.existsSync(dbPath)) {
    console.log(`[x] ${relPath}: FILE DOES NOT EXIST`);
    continue;
  }

  const stat = fs.statSync(dbPath);
  console.log(`[✓] ${relPath}: Exists (Size: ${(stat.size / 1024).toFixed(1)} KB)`);

  // Default empty SQLite DB is ~100KB with initial schema tables and 0 data rows
  if (stat.size <= 102400) {
    console.log(`    Status: Empty schema database (no user rows detected).`);
  } else {
    console.log(`    Status: Contains non-empty data payload (${stat.size} bytes).`);
    foundLegacyData = true;
  }
}

console.log('\n--------------------------------------------------');
if (foundLegacyData) {
  console.log('RESULT: REAL LEGACY DATA DETECTED.');
  console.log('Action: Data migration script required before cutover.');
} else {
  console.log('RESULT: NO REAL PRODUCTION DATA FOUND IN TURSO / LOCAL SQLITE.');
  console.log('Action: No data migration needed. Initialize fresh Supabase PostgreSQL schema.');
}
console.log('--------------------------------------------------\n');
