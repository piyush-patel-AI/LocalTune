import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Split a multi-statement SQL string into individual statements.
 * Exported because remote backends execute one statement per round trip.
 */
export function splitStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Apply versioned SQL migrations from this directory, oldest first.
 *
 * Note: unlike the original better-sqlite3 implementation there is no explicit
 * BEGIN/COMMIT wrapper here. Atomic batches would abort the whole migration on
 * any error, but "duplicate column name" is intentionally tolerated (a column
 * may already exist when a database was created from schema.sql). Each file's
 * statements are idempotent (CREATE TABLE IF NOT EXISTS / guarded ALTERs), and
 * the filename is only recorded in schema_migrations after every statement of
 * that file succeeded — so an interrupted migration simply re-runs next boot.
 *
 * @param {object} client async database client (see server/db.js)
 */
export async function runMigrations(client) {
  // Ensure schema_migrations table exists
  await client.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const appliedRows = await client.all(`SELECT filename FROM schema_migrations`);
  const appliedSet = new Set(appliedRows.map((r) => r.filename));

  const files = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const sqlPath = path.join(__dirname, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      console.log(`[MigrationManager] Applying migration: ${file}`);

      const statements = splitStatements(sql);

      for (const stmt of statements) {
        try {
          await client.exec(stmt);
        } catch (err) {
          // Ignore alter table column duplicate errors if column already existed
          if (!err.message.includes('duplicate column name')) {
            throw err;
          }
        }
      }

      await client.run(`INSERT INTO schema_migrations (filename) VALUES (?)`, file);

      console.log(`[MigrationManager] Applied: ${file}`);
    }
  }
}
