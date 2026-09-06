// Dedicated API client layer for LocalTune server endpoints
// Supports both cookie-based sessions (desktop) and Bearer token fallback (mobile WebView)

const TOKEN_STORAGE_KEY = 'lt_session_token';

/** Persist session token for WebView environments where cross-site cookies are blocked */
function storeSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (_) {}
}

function getStoredSessionToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || null;
  } catch (_) {
    return null;
  }
}

export function clearSessionToken() {
  storeSessionToken(null);
}

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // matches server multer 10MB limit

/** Validate a selected file is an accepted image type and within size limits. */
export function isValidImage(file) {
  if (!file) return false;
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return false;
  if (file.size > MAX_IMAGE_BYTES) return false;
  if (!(file instanceof Blob) || (file.type && !file.type.startsWith('image/'))) return false;
  return true;
}

export function getImageAccept() {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].join(',');
}

/**
 * Downscale and compress a selected image client-side to keep uploads
 * reasonable and square-friendly. Returns a Promise<Blob>. Falls back to the
 * original file if canvas processing is unavailable (e.g. some WebViews).
 */
export function prepareImage(file) {
  return new Promise((resolve) => {
    if (typeof createImageBitmap !== 'function' && typeof Image === 'undefined') {
      return resolve(file);
    }
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const MAX_DIM = 1024;
          const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              resolve(blob || file);
            },
            'image/jpeg',
            0.85
          );
        } catch (_) {
          URL.revokeObjectURL(url);
          resolve(file);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    } catch (_) {
      resolve(file);
    }
  });
}

export function apiUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const baseUrl =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) || '';
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
}

async function request(endpoint, options = {}) {
  const url = apiUrl(endpoint);

  // Build auth headers — include stored Bearer token as a WebView fallback
  const authHeaders = {};
  const storedToken = getStoredSessionToken();
  if (storedToken) {
    authHeaders['Authorization'] = `Bearer ${storedToken}`;
  }

  const config = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
    ...options,
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    config.body = JSON.stringify(options.body);
  } else if (options.body instanceof FormData) {
    // Let the browser set the multipart boundary; do not force application/json
    config.body = options.body;
    if (config.headers['Content-Type'] === 'application/json') {
      delete config.headers['Content-Type'];
    }
  }

  const response = await fetch(url, config);
  if (!response.ok) {
    let errorMsg = `API request failed with status ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.error) errorMsg = errJson.error;
    } catch (_) {}
    const err = new Error(errorMsg);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

export const api = {
  apiUrl,

  // Auth — token is stored/cleared here at the API layer
  getMe: () => request('/api/me').then((data) => {
    // Refresh token on successful /api/me so WebView sessions stay alive
    if (data.sessionToken) storeSessionToken(data.sessionToken);
    return data;
  }),

  login: (username, password) =>
    request('/api/login', { method: 'POST', body: { username, password } }).then((data) => {
      if (data.sessionToken) storeSessionToken(data.sessionToken);
      return data;
    }),

  register: (username, password) =>
    request('/api/register', { method: 'POST', body: { username, password } }).then((data) => {
      if (data.sessionToken) storeSessionToken(data.sessionToken);
      return data;
    }),

  logout: () =>
    request('/api/logout', { method: 'POST' }).then((data) => {
      clearSessionToken();
      return data;
    }),

  // Tracks & Media
  getTracks: (params = {}) => {
    const searchParams = new URLSearchParams();
    if (params.search) searchParams.set('search', params.search);
    if (params.groupBy) searchParams.set('groupBy', params.groupBy);
    if (params.limit) searchParams.set('limit', params.limit);
    const queryString = searchParams.toString();
    return request(`/api/tracks${queryString ? `?${queryString}` : ''}`);
  },
  getTrackArtUrl: (trackId) => apiUrl(`/api/tracks/${trackId}/art`),
  getArtistImageUrl: (artistName) =>
    apiUrl(`/api/tracks/artist-image/${encodeURIComponent(artistName)}`),
  getStreamUrl: (trackId) => apiUrl(`/stream/${trackId}`),

  // Playlists
  getPlaylists: () => request('/api/playlists'),
  createPlaylist: (name, description = '') =>
    request('/api/playlists', { method: 'POST', body: { name, description } }),
  getPlaylistTracks: (playlistId) => request(`/api/playlists/${playlistId}/tracks`),
  addTrackToPlaylist: (playlistId, trackId) =>
    request(`/api/playlists/${playlistId}/tracks`, { method: 'POST', body: { trackId } }),
  removeTrackFromPlaylist: (playlistId, trackId) =>
    request(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' }),
  uploadPlaylistCover: (playlistId, file) => {
    const form = new FormData();
    form.append('cover', file);
    return request(`/api/playlists/${playlistId}/cover`, { method: 'POST', body: form });
  },
  createPlaylistWithCover: (name, file) => {
    const form = new FormData();
    form.append('name', name || '');
    if (file) form.append('cover', file);
    return request('/api/playlists', { method: 'POST', body: form });
  },

  // Account / Profile
  uploadUserAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return request('/api/users/avatar', { method: 'POST', body: form });
  },

  // Favorites
  getFavorites: () => request('/api/favorites'),
  addFavorite: (trackId) => request(`/api/favorites/${trackId}`, { method: 'POST' }),
  removeFavorite: (trackId) => request(`/api/favorites/${trackId}`, { method: 'DELETE' }),

  // Telemetry & Listen Stats
  logListen: (trackId, durationPlayed, completed = false) =>
    request('/api/stats/listen', {
      method: 'POST',
      body: { trackId, durationPlayed, completed },
    }).catch((err) => console.warn('Failed to log listen stats:', err)),
};

export default api;
