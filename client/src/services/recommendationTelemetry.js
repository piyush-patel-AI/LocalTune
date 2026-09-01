// Recommendation telemetry: POSTs recommendation-surface actions back to
// /api/tracks/recommendations/log so the server can learn from performed
// recommendations (play, played-through, skipped, replay, added-to-queue).
//
// Fire-and-forget: failures are silent and never disrupt the player.

const REC_LOG = '/api/tracks/recommendations/log';

function getSessionId() {
  try {
    let sid = window.sessionStorage.getItem('localtune_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      window.sessionStorage.setItem('localtune_session_id', sid);
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
  fetch(REC_LOG, {
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