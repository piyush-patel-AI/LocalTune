import { apiUrl } from './api.js';

export const recommendationService = {
  // Fetch V2 recommendation shelves
  async getShelves(currentTrackId = null) {
    const url = `/api/tracks/recommendations/shelves${currentTrackId ? `?currentTrackId=${currentTrackId}` : ''}`;
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch recommendation shelves');
    const data = await res.json();
    return data.shelves || [];
  },

  // Fetch flat ranked recommendations
  async getRecommendations(currentTrackId = null) {
    const url = `/api/tracks/recommendations${currentTrackId ? `?currentTrackId=${currentTrackId}` : ''}`;
    const res = await fetch(apiUrl(url), { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch recommendations');
    const data = await res.json();
    return data.tracks || [];
  },

  // Fetch discovery radar tracks
  async getDiscoveryRadar() {
    const res = await fetch(apiUrl('/api/tracks/recommendations/discovery'), { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch discovery radar');
    const data = await res.json();
    return data.tracks || [];
  },

  // Fetch forgotten favorites
  async getForgottenFavorites() {
    const res = await fetch(apiUrl('/api/tracks/recommendations/forgotten'), { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch forgotten favorites');
    const data = await res.json();
    return data.tracks || [];
  },

  // Fetch autoplay next tracks
  async getAutoplayTracks(currentTrackId, excludeIds = [], count = 5) {
    const params = new URLSearchParams();
    if (currentTrackId) params.set('currentTrackId', currentTrackId);
    if (excludeIds.length > 0) params.set('exclude', excludeIds.join(','));
    params.set('count', count);
    const res = await fetch(apiUrl(`/api/tracks/recommendations/autoplay?${params.toString()}`), { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch autoplay tracks');
    const data = await res.json();
    return data.tracks || [];
  },

  // Log recommendation actions back to backend
  async logAction({ trackId, shelfId, action, source, surface, sessionId, currentTrackId, positionInQueue }) {
    if (!trackId || !action) return;
    try {
      await fetch(apiUrl('/api/tracks/recommendations/log'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trackId,
          shelfId,
          action,
          source: source || 'v3_client',
          surface: surface || 'home',
          sessionId: sessionId || null,
          currentTrackId: currentTrackId || null,
          positionInQueue: positionInQueue ?? null,
        }),
      });
    } catch (err) {
      console.warn('Failed to log recommendation action:', err);
    }
  },
};
