import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFile } from 'node:fs/promises';
import { apiUrl, api } from '../services/api.js';

// Read any repo file relative to this test file (client: ../, server: ../../../).
const readSource = (relPath) => readFile(new URL(relPath, import.meta.url), 'utf8');

describe('Existing-Account PFP Replacement', () => {
  test('backend replaces (not only inserts) via upsert on the deterministic avatar key', async () => {
    const auth = await readSource('../../../server/routes/auth.js');
    const uploadCall = auth.slice(auth.indexOf("router.post('/users/avatar',"));
    assert.ok(uploadCall.includes('{ upsert: true }'), 'avatar upload upserts existing object');
    assert.ok(!/uploadToStorage\(key, req\.file\.buffer, req\.file\.mimetype \|\| 'image\/jpeg'\);/.test(auth), 'no upsert-less avatar upload remains');
  });

  test('upload failure is checked and surfaces a 500 (not silently ignored)', async () => {
    const auth = await readSource('../../../server/routes/auth.js');
    assert.ok(/if \(!upload\)/.test(auth), 'upload result is validated');
    assert.ok(/Failed to update avatar/.test(auth), 'error response returned on failure');
  });

  test('server returns a versioned avatar URL so cached images are invalidated', async () => {
    const auth = await readSource('../../../server/routes/auth.js');
    assert.ok(/avatar_version/.test(auth), 'formatUserObj reads avatar_version');
    assert.ok(/\/api\/users\/\$\{u\.id\}\/avatar\?v=\$\{version\}/.test(auth), 'avatarUrl embeds ?v=version');
  });

  test('version bumps on EVERY (re)upload, enabling multiple replacements', async () => {
    const db = await readSource('../../../server/db.js');
    assert.ok(/avatar_version = avatar_version \+ 1/.test(db), 'updateUserAvatar increments version per upload');
  });

  test('getUserById / public list expose avatar_version', async () => {
    const db = await readSource('../../../server/db.js');
    assert.ok(/avatar_version/.test(db), 'db layer selects avatar_version');
    assert.ok(/getUserById = async/.test(db), 'getUserById still defined');
  });

  test('schema adds avatar_version with default 0 (backward compatible)', async () => {
    const supabase = await readSource('../../../supabase/migrations/001_initial_schema.sql');
    assert.ok(/avatar_version\s+INTEGER NOT NULL DEFAULT 0/.test(supabase), 'supabase consolidated schema has column');
    const bump = await readSource('../../../supabase/migrations/004_avatar_version.sql');
    assert.ok(/ADD COLUMN IF NOT EXISTS avatar_version/.test(bump), 'existing-DB migration is idempotent');
  });

  test('replacement persists after reload: /api/me returns the same versioned user object', async () => {
    const auth = await readSource('../../../server/routes/auth.js');
    assert.ok(/router\.get\('\/me'/.test(auth), '/api/me route exists');
    const meBlock = auth.slice(auth.indexOf("router.get('/me'"), auth.indexOf('export default router'));
    assert.ok(meBlock.includes('formatUserObj(user)'), '/api/me returns the versioned profile (persists reload)');
  });

  test('apiUrl preserves the ?v= cache-buster across renders (stable, not random junk)', async () => {
    const url = apiUrl('/api/users/5/avatar?v=2');
    assert.ok(url.endsWith('/api/users/5/avatar?v=2'), `versioned URL preserved: ${url}`);
  });
});

describe('AuthContext / UI Synchronization', () => {
  test('AuthContext.updateAvatar sets the returned (versioned) user into state', async () => {
    const ctx = await readSource('../context/AuthContext.jsx');
    assert.ok(/updateAvatar/.test(ctx), 'updateAvatar exposed');
    const block = ctx.slice(ctx.indexOf('updateAvatar'), ctx.indexOf('updateAvatar') + 400);
    assert.ok(/setUser\(data\.user\)/.test(block), 'user state updated immediately after upload');
  });

  test('Header avatar renders from the single authoritative user state', async () => {
    const header = await readSource('../components/Header.jsx');
    assert.ok(/useAuth\(\)/.test(header), 'Header reads auth context');
    assert.ok(/UserAvatar/.test(header), 'Header uses the shared avatar component');
  });

  test('AccountModal applies replacement via updateAvatar and drops the preview', async () => {
    const modal = await readSource('../components/AccountModal.jsx');
    assert.ok(/updateAvatar\(/.test(modal), 'modal uploads through updateAvatar');
    assert.ok(/setPreviewUrl\(null\)/.test(modal), 'local preview cleared on success');
  });

  test('broken/missing avatar falls back safely (no broken image icon)', async () => {
    const avatar = await readSource('../components/UserAvatar.jsx');
    assert.ok(/failed/.test(avatar), 'broken-image state tracked');
    assert.ok(/initial/.test(avatar), 'initial-letter fallback rendered');
  });

  test('new-account initial upload and existing-account replacement share one path', async () => {
    const auth = await readSource('../../../server/routes/auth.js');
    // One handler serves both; no separate INSERT-only/vs-update branch exists.
    const handlers = auth.match(/router\.post\('\/users\/avatar'/g) || [];
    assert.strictEqual(handlers.length, 1, 'single shared upload endpoint for new + existing accounts');
  });
});

describe('Client api.uploadUserAvatar semantics', () => {
  test('uploads under the avatar field to /api/users/avatar', async () => {
    let capturedUrl = null;
    let capturedBody = null;
    let capturedMethod = null;
    const origFetch = global.fetch;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedBody = opts.body;
      capturedMethod = opts.method;
      return {
        ok: true,
        json: async () => ({
          success: true,
          user: { id: 5, username: 'veteran', displayName: 'Veteran', avatarUrl: '/api/users/5/avatar?v=2' },
        }),
      };
    };

    try {
      const file = new File([new Uint8Array(16).fill(2)], 'new.png', { type: 'image/png' });
      const res = await api.uploadUserAvatar(file);
      assert.strictEqual(capturedMethod, 'POST');
      assert.ok(capturedUrl.endsWith('/api/users/avatar'));
      assert.ok(capturedBody instanceof FormData, 'multipart body');
      assert.strictEqual(capturedBody.get('avatar'), file);
      assert.ok(res.user.avatarUrl.includes('?v=2'), 'replacement response carries new version');
    } finally {
      global.fetch = origFetch;
    }
  });
});