/**
 * Initialize & verify the FRESH Turso Cloud production database.
 *
 * This is the production cutover entrypoint: it creates the schema from
 * schema.sql and applies every versioned migration (001-007) directly on the
 * remote database through @tursodatabase/serverless — the exact same code path
 * the server runs automatically on first boot. Safe to re-run (fully
 * idempotent); useful right after `turso db create` to confirm credentials,
 * network access and schema before deploying.
 *
 * Requires TURSO_DATABASE_URL (+ TURSO_AUTH_TOKEN) in the environment or
 * server/.env. The local localtune.db archive is never touched.
 *
 * Usage: npm run init-turso
 */
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !url.startsWith('libsql://')) {
  console.error('❌ TURSO_DATABASE_URL missing or invalid (expected libsql://...turso.io).');
  console.error('   Create a database first:  turso db create localtune-prod --location <region>');
  console.error('   Then:                     turso db show localtune-prod --url');
  process.exit(1);
}
if (!authToken) {
  console.error('❌ TURSO_AUTH_TOKEN missing.');
  console.error('   Create one with:          turso db tokens create localtune-prod');
  process.exit(1);
}

async function main() {
  const { initDatabase, getBackendMode, rawAll } = await import('../db.js');

  await initDatabase();
  if (getBackendMode() !== 'turso') {
    throw new Error(`Expected turso backend, got "${getBackendMode()}"`);
  }
  console.log('✅ Connected to Turso and applied schema.sql + all migrations.');

  const migrations = await rawAll('SELECT filename FROM schema_migrations ORDER BY filename');
  console.log(`✅ schema_migrations (${migrations.length} applied):`);
  for (const m of migrations) console.log(`   - ${m.filename}`);

  const tables = (
    await rawAll(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  ).map((r) => r.name);

  console.log('✅ Tables and row counts:');
  for (const t of tables) {
    const { c } = await rawAll(`SELECT COUNT(*) AS c FROM "${t}"`).then((r) => r[0]);
    console.log(`   - ${t}: ${c}`);
  }

  console.log('\n🎉 Fresh Turso production database is ready.');
  console.log('   Library builds entirely from port-5050 uploads (media → B2, records → Turso).');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Turso initialization FAILED:', err.message);
    process.exit(1);
  });
