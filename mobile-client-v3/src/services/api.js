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
