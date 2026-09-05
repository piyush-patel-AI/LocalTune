import pg from 'pg';
const c = new pg.Client({ connectionString: 'postgres://postgres:postgres@localhost:5432/localtune_test' });
await c.connect();
await c.query('BEGIN');
const t = ['recommendation_logs','song_transitions','play_logs','playlist_tracks','favorites','playlists','artist_images','tracks','users','schema_migrations'];
for (const x of t) await c.query(`TRUNCATE ${x} CASCADE`);
await c.query('COMMIT');
await c.end();
console.log('cleaned');
