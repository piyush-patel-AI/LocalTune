import pg from 'pg';

/**
 * Test helpers for PostgreSQL backend.
 *
 * TEST_DATABASE_URL must be set to a PostgreSQL connection string.
 * The test database is cleaned between test files via cleanAllTables().
 */

let pool = null;

export function getTestPool() {
  if (!pool) {
    const connStr = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
    if (!connStr) {
      throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set to run tests');
    }
    pool = new pg.Pool({ connectionString: connStr, max: 5 });
  }
  return pool;
}

export async function cleanAllTables() {
  const p = getTestPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    const tables = [
      'recommendation_logs', 'song_transitions', 'play_logs',
      'playlist_tracks', 'favorites', 'playlists',
      'artist_images', 'tracks', 'users', 'schema_migrations',
      'user_sessions'
    ];
    for (const t of tables) {
      try {
        await client.query(`TRUNCATE ${t} CASCADE`);
      } catch (err) {
        if (err.code !== '42P01') throw err; // undefined_table: skip, e.g. user_sessions
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Initialize the test database connection and clean all tables.
 * Call this in a `before()` hook or at the top of each test file.
 */
export async function initTestDb() {
  process.env.NODE_ENV = 'test';
  const { initDatabase } = await import('../db.js');
  await initDatabase();
  await cleanAllTables();
}

// Backward compatibility alias for test files
export const useTempDb = () => {};

