import fs from 'fs';
import path from 'path';
import os from 'os';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

const dbPath = (() => {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localtune-mig-'));
  process.env.DB_PATH = path.join(dir, 'migrations.db');
  return process.env.DB_PATH;
})();

test('migration startup applies all versioned migrations on a fresh database', async () => {
  assert.ok(!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0, 'test db starts empty');

  const { initDatabase, rawAll, rawGet, getBackendMode } = await import('../db.js');
  await initDatabase();

  assert.equal(getBackendMode(), 'local');
  assert.ok(fs.statSync(dbPath).size > 0, 'sqlite file created');

  const applied = await rawAll('SELECT * FROM schema_migrations ORDER BY filename');
  const filenames = new Set(applied.map((r) => r.filename));
  for (const v of ['001', '002', '003', '004', '005']) {
    assert.ok(
      [...filenames].some((f) => f.startsWith(`${v}_`)),
      `migration ${v} recorded as applied`
    );
  }
  for (const r of applied) {
    assert.ok(r.applied_at, `${r.filename} carries applied_at timestamp`);
  }

  // Core tables exist with real columns added by later migrations
  const tcols = (await rawAll(`PRAGMA table_info(tracks)`)).map((c) => c.name);
  assert.ok(tcols.includes('b2_key'), 'b2_key column exists (005)');
  assert.ok(tcols.includes('artwork_b2_key'), 'artwork_b2_key column exists (005)');
  assert.ok(tcols.includes('cover_art_path'), 'cover_art_path column exists (006 convergence)');
});

test('initDatabase is idempotent — second call does not duplicate or fail', async () => {
  const { initDatabase, rawAll } = await import('../db.js');
  const before = (await rawAll('SELECT COUNT(*) c FROM schema_migrations'))[0].c;

  await initDatabase(); // second call
  const after = (await rawAll('SELECT COUNT(*) c FROM schema_migrations'))[0].c;
  assert.equal(before, after, 'schema_migrations not duplicated');
});
