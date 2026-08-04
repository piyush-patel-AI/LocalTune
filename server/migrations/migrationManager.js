import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(db) {
  // Ensure schema_migrations table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = db.prepare(`SELECT filename FROM schema_migrations`).all();
  const appliedSet = new Set(appliedRows.map((r) => r.filename));

  const files = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!appliedSet.has(file)) {
      const sqlPath = path.join(__dirname, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');

      console.log(`[MigrationManager] Applying migration: ${file}`);
      
      const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
      
      db.transaction(() => {
        for (const stmt of statements) {
          try {
            db.exec(stmt);
          } catch (err) {
            // Ignore alter table column duplicate errors if column already existed
            if (!err.message.includes('duplicate column name')) {
              throw err;
            }
          }
        }
        db.prepare(`INSERT INTO schema_migrations (filename) VALUES (?)`).run(file);
      })();

      console.log(`[MigrationManager] Applied: ${file}`);
    }
  }
}
