// Recommendation telemetry for the mobile client: POSTs recommendation-surface
// actions back to /api/tracks/recommendations/log. Fire-and-forget.

import { apiUrl } from '../config';

const REC_LOG = '/api/tracks/recommendations/log';

function getSessionId() {
  try {
    let sid = localStorage.getItem('localtune_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('localtune_session_id', sid);
    }
    return sid;
  } catch {
    return null;
  }
}

/**
 * @param {number} trackId
 * @param {string} action played | completed | skipped | replay | queued
 * @param {object} meta { shelfId, source, surface, currentTrackId, positionInQueue }
 */
export function logRecommendationAction(trackId, action, meta = {}) {
  if (!trackId || !action) return;
  fetch(apiUrl(REC_LOG), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      trackId,
      action,
      shelfId: meta.shelfId || meta.surface || 'recommended',
      source: meta.source || 'shelf',
      surface: meta.surface || meta.shelfId || 'generic',
      sessionId: meta.sessionId || getSessionId(),
      currentTrackId: meta.currentTrackId || null,
      positionInQueue: meta.positionInQueue
    })
  }).catch(() => {});
}

export const getRecommendationSessionId = getSessionId;