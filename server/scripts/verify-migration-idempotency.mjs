// Safely re-apply supabase/migrations/003_recommendation_v2.sql twice
// against <TEST_DATABASE_URL> (or DATABASE_URL) and assert the schema is
// unchanged between applications. Idempotent DDL only: ADD COLUMN IF NOT EXISTS
// + CREATE INDEX IF NOT EXISTS, so existing data is never affected.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sqlPath = resolve(ROOT, 'supabase/migrations/003_recommendation_v2.sql');
const connStr = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!connStr) {
  console.error('TEST_DATABASE_URL or DATABASE_URL required');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: connStr, max: 1 });
const sql = readFileSync(sqlPath, 'utf8');
// Split on statement-terminating semicolons at line ends (comments preserved as no-ops).
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

async function schemaSnapshot(client) {
  const cols = await client.query(
    `SELECT table_name || '.' || column_name AS col
       FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name IN ('play_logs','recommendation_logs','tracks')
      ORDER BY table_name, ordinal_position`
  );
  const idx = await client.query(
    `SELECT indexname FROM pg_indexes
      WHERE schemaname='public'
        AND indexname IN ('idx_play_logs_user_timestamp','idx_play_logs_user_track',
                          'idx_rec_logs_user_timestamp','idx_rec_logs_user_track_action',
                          'idx_song_transitions_user_from_time')
      ORDER BY indexname`
  );
  return { cols: cols.rows.map((r) => r.col), idx: idx.rows.map((r) => r.indexname) };
}

const client = await pool.connect();
try {
  const before = await schemaSnapshot(client);

  for (const pass of [1, 2]) {
    for (const stmt of statements) {
      await client.query(stmt); // throws on any error -> idempotency violated
    }
    console.log(`pass ${pass}: applied ${statements.length} statements without error`);
  }

  const after = await schemaSnapshot(client);
  const sameCols = JSON.stringify(before.cols) === JSON.stringify(after.cols);
  const sameIdx = JSON.stringify(before.idx) === JSON.stringify(after.idx);

  console.log(`columns (before): ${before.cols.length} | (after): ${after.cols.length} -> ${sameCols ? 'IDENTICAL' : 'CHANGED'}`);
  console.log(`indexes  (before): ${before.idx.length} | (after): ${after.idx.length} -> ${sameIdx ? 'IDENTICAL' : 'CHANGED'}`);
  const recCols = after.cols.filter((c) => c.startsWith('recommendation_logs.'));
  const playCols = after.cols.filter((c) => c.startsWith('play_logs.'));
  const trackCols = after.cols.filter((c) => c.startsWith('tracks.'));
  console.log(`recommendation_logs cols: ${recCols.join(', ')}`);
  console.log(`play_logs cols: ${playCols.join(', ')}`);
  console.log(`tracks cols: ${trackCols.join(', ')}`);

  if (sameCols && sameIdx) {
    console.log('RESULT: IDEMPOTENT');
  } else {
    console.log('RESULT: NOT IDEMPOTENT');
    process.exitCode = 1;
  }
} finally {
  client.release();
  await pool.end();
}