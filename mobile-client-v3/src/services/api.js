// Dedicated API client layer for LocalTune server endpoints

export function apiUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const baseUrl = import.meta.env.VITE_API_URL || '';
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : '/' + path}`;
}

async function request(endpoint, options = {}) {
  const url = apiUrl(endpoint);
  const config = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
    throw new Error(errorMsg);
  }

  return response.json();
}

export const api = {
  // Auth
  getMe: () => request('/api/me'),
  login: (username, password) => request('/api/login', { method: 'POST', body: { username, password } }),
  register: (username, password) => request('/api/register', { method: 'POST', body: { username, password } }),
  logout: () => request('/api/logout', { method: 'POST' }),

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
  getArtistImageUrl: (artistName) => apiUrl(`/api/tracks/artist-image/${encodeURIComponent(artistName)}`),
  getStreamUrl: (trackId) => apiUrl(`/stream/${trackId}`),

  // Playlists
  getPlaylists: () => request('/api/playlists'),
  createPlaylist: (name, description = '') => request('/api/playlists', { method: 'POST', body: { name, description } }),
  getPlaylistTracks: (playlistId) => request(`/api/playlists/${playlistId}/tracks`),
  addTrackToPlaylist: (playlistId, trackId) => request(`/api/playlists/${playlistId}/tracks`, { method: 'POST', body: { trackId } }),
  removeTrackFromPlaylist: (playlistId, trackId) => request(`/api/playlists/${playlistId}/tracks/${trackId}`, { method: 'DELETE' }),

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
