/**
 * mobile-client-v3/src/services/playerModes.js
 *
 * Pure decision helpers for the V3 transport modes (shuffle + repeat).
 *
 * The PlayerContext remains the single source of truth for playback; these
 * helpers only compute ORDER (shuffling) and the END-OF-TRACK decision so the
 * behavior is unit-testable without a DOM or the audio engine. No queue data is
 * duplicated here and the original queue order is never permanently
 * destroyed — shuffle only ever affects the slices handed to it.
 */

/**
 * Fisher–Yates shuffle. Returns a NEW array that is a permutation of `list`
 * (same elements, so unique IDs stay unique). Never mutates the input.
 */
export function shuffleArray(list) {
  const copy = list ? [...list] : [];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Shuffle only the UPCOMING slice of the effective queue while the currently
 * playing track (and everything at or before `index`) stays untouched.
 *
 * - index < 0 (no current track): shuffle the whole list.
 * - list with < 2 items or no upcoming slice: returned unchanged.
 */
export function shuffleUpcoming(list, index) {
  const copy = list ? [...list] : [];
  if (index < 0 || copy.length < 2) return copy;
  const head = copy.slice(0, index + 1);
  const tail = copy.slice(index + 1);
  return tail.length < 2 ? copy : [...head, ...shuffleArray(tail)];
}

/**
 * Single decision path for the HTML5 audio `ended` event. Resolves how
 * playback should continue given the current modes — this is the ONE place
 * repeat-one / repeat-queue / shuffle / normal advancement / autoplay are
 * reconciled.
 *
 * Returns one of:
 *   { action: 'replay' }                     repeat-one → restart the same track
 *   { action: 'advance', index }             next queue item exists
 *   { action: 'wrap', shuffle: boolean }     repeat-queue → back to the top of
 *                                            the (possibly re-shuffled) queue
 *   { action: 'autoplay' }                   queue exhausted → existing V2
 *                                            recommendation/autoplay behavior
 */
export function nextPlaybackAfterEnd({
  repeatMode = 'off',
  queue = [],
  queueIndex = -1,
  shuffleEnabled = false,
} = {}) {
  if (repeatMode === 'one') return { action: 'replay' };
  if (queueIndex + 1 < queue.length) {
    return { action: 'advance', index: queueIndex + 1 };
  }
  if (repeatMode === 'queue' && queue.length > 0) {
    return { action: 'wrap', shuffle: !!shuffleEnabled };
  }
  return { action: 'autoplay' };
}