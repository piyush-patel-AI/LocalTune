import fs from 'fs';
import os from 'os';
import path from 'path';

export function makeTempDb(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `localtune-${label}-`));
  return path.join(dir, `${label}.db`);
}

/** Point the db layer at a fresh temp SQLite file BEFORE importing ../db.js */
export function useTempDb(label) {
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;
  process.env.DB_PATH = makeTempDb(label);
}
