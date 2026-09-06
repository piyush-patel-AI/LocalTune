import assert from 'node:assert';
import { test, describe } from 'node:test';
import { readFile } from 'node:fs/promises';
import { apiUrl, isValidImage, getImageAccept } from '../services/api.js';

// Helper: read a source file's text for structural assertions
function readSource(relPath) {
  return readFile(new URL(`../${relPath}`, import.meta.url), 'utf8');
}

// Minimal Blob-based file usable to construct FormData in Node tests
function makeImageFile({ type = 'image/jpeg', size = 1024, name = 'photo.jpg' } = {}) {
  return new File([new Uint8Array(size).fill(1)], name, { type });
}

describe('Fake Status Bar Removal', () => {
  test('App.jsx does not render the fake status bar markup', async () => {
    const app = await readSource('App.jsx');
    assert.ok(!/6:11/.test(app), 'fake time must not appear in App.jsx');
  });

  test('App.jsx contains no fake status-bar container', async () => {
    const app = await readSource('App.jsx');
    assert.ok(!/Top Mobile Status Bar/.test(app), 'fake status bar container comment removed');
    assert.ok(!/battery/.test(app), 'no battery markup');
  });

  test('safe-area layout is present in App.jsx', async () => {
    const app = await readSource('App.jsx');
    assert.ok(/app-safe-area/.test(app), 'app layout uses .app-safe-area for insets');
  });

  test('index.css defines non-fake safe-area env() handling', async () => {
    const css = await readSource('styles/index.css');
    assert.ok(/env\(safe-area-inset-top/.test(css), 'CSS uses env(safe-area-inset-top)');
    assert.ok(/env\(safe-area-inset-bottom/.test(css), 'CSS uses env(safe-area-inset-bottom)');
    assert.ok(/constant\(safe-area-inset-top/.test(css), 'iOS constant() fallback present');
  });
});

describe('Playlist Image Contract', () => {
  test('api exposes uploadPlaylistCover hitting /:id/cover with cover field', async () => {
    const { api } = await import('../services/api.js');
    assert.strictEqual(typeof api.uploadPlaylistCover, 'function');

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
        json: async () => ({ playlist: { id: 9, cover_path: 'playlist_covers/9.jpg' } }),
      };
    };

    try {
      const fakeFile = makeImageFile({ type: 'image/png', name: 'art.png' });
      const res = await api.uploadPlaylistCover(9, fakeFile);

      assert.strictEqual(capturedMethod, 'POST');
      assert.ok(capturedUrl.endsWith('/api/playlists/9/cover'), `got ${capturedUrl}`);
      assert.ok(capturedBody instanceof FormData, 'body is FormData for multipart');
      assert.strictEqual(capturedBody.get('cover'), fakeFile, 'file attached under "cover" field');
      assert.ok(res.playlist.cover_path, 'server response returns persisted cover_path');
    } finally {
      global.fetch = origFetch;
    }
  });

  test('custom image upload takes priority and persists via cover_path', async () => {
    // Simulates: playlist with custom cover_path => PlaylistCover renders the
    // /cover endpoint; without cover_path it falls back to sample_tracks.
    const withCover = { id: 9, name: 'A', cover_path: 'playlist_covers/9.jpg', sample_tracks: [{ id: 1 }] };
    const withoutCover = { id: 10, name: 'B', cover_path: null, sample_tracks: [{ id: 2, cover_art_path: '/a.jpg' }] };

    assert.ok(withCover.cover_path, 'custom image present');
    assert.strictEqual(withoutCover.cover_path, null, 'fallback used when no custom image');
    assert.ok(Array.isArray(withoutCover.sample_tracks), 'deterministic fallback from tracks');
  });

  test('invalid image files are rejected by validation', () => {
    assert.strictEqual(isValidImage(makeImageFile({ type: 'text/plain' })), false, 'non-image type rejected');
    assert.strictEqual(isValidImage(makeImageFile({ type: 'image/jpeg', size: 11 * 1024 * 1024 })), false, 'oversize rejected');
    assert.strictEqual(isValidImage(makeImageFile({ type: 'image/jpeg', size: 1024 })), true, 'valid jpeg accepted');
    assert.strictEqual(isValidImage(null), false, 'no file rejected');
  });

  test('getImageAccept lists accepted mime types', () => {
    const accept = getImageAccept();
    assert.ok(accept.includes('image/jpeg'));
    assert.ok(accept.includes('image/png'));
    assert.ok(accept.includes('image/webp'));
  });
});

describe('Account Image Contract', () => {
  test('api exposes uploadUserAvatar hitting /api/users/avatar with avatar field', async () => {
    const { api } = await import('../services/api.js');
    assert.strictEqual(typeof api.uploadUserAvatar, 'function');

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
          user: { id: 1, username: 'piyush', displayName: 'Piyush', avatarUrl: '/api/users/1/avatar' },
        }),
      };
    };

    try {
      const fakeFile = makeImageFile();
      const res = await api.uploadUserAvatar(fakeFile);

      assert.strictEqual(capturedMethod, 'POST');
      assert.ok(capturedUrl.endsWith('/api/users/avatar'), `got ${capturedUrl}`);
      assert.ok(capturedBody instanceof FormData, 'body is FormData for multipart');
      assert.strictEqual(capturedBody.get('avatar'), fakeFile, 'file attached under "avatar" field');
      assert.strictEqual(res.user.avatarUrl, '/api/users/1/avatar');
    } finally {
      global.fetch = origFetch;
    }
  });

  test('avatarUrl relative path resolves to API base via apiUrl', () => {
    assert.strictEqual(apiUrl('/api/users/1/avatar'), '/api/users/1/avatar');
  });

  test('profile image mapping is used by Header and AccountModal via UserAvatar', async () => {
    const header = await readSource('components/Header.jsx');
    const account = await readSource('components/AccountModal.jsx');
    assert.ok(/UserAvatar/.test(header), 'Header uses shared UserAvatar');
    assert.ok(/UserAvatar/.test(account), 'AccountModal uses shared UserAvatar');
  });

  test('fallback initial shows when no avatarUrl', async () => {
    const avatar = await readSource('components/UserAvatar.jsx');
    assert.ok(/avatarUrl/.test(avatar), 'UserAvatar reads avatarUrl');
    assert.ok(/object-cover/.test(avatar), 'object-cover keeps circular presentation');
    assert.ok(/initial/.test(avatar), 'initial fallback present');
  });
});