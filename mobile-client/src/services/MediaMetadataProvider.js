/**
 * MediaMetadataProvider
 * Handles metadata formatting, multi-resolution artwork URLs, and standard Web MediaSession API synchronization.
 */

export function getArtworkUrl(track, requestedSize = 512) {
  if (!track) return '';
  let url = track.coverUrl || track.cover_art_url || `/api/tracks/${track.id}/art?size=${requestedSize}&ngrok-skip-browser-warning=69420`;

  if (typeof window !== 'undefined' && !url.startsWith('http://') && !url.startsWith('https://')) {
    try {
      url = new URL(url, window.location.href).href;
    } catch (e) {}
  }
  return url;
}

export function getMultiSizeArtwork(track) {
  if (!track) return [];
  const sizes = [96, 128, 192, 256, 384, 512];
  return sizes.map((size) => ({
    src: getArtworkUrl(track, size),
    sizes: `${size}x${size}`,
    type: 'image/png'
  }));
}

let lastPostTime = 0;
export function syncServerPlaybackState(state = {}) {
  const now = Date.now();
  if (now - lastPostTime < 1000) return;
  lastPostTime = now;

  try {
    fetch('/api/playback-state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': '69420'
      },
      body: JSON.stringify(state)
    }).catch(() => {});
  } catch (e) {}
}

export function updateMediaSessionMetadata(track) {
  if (track) {
    syncServerPlaybackState({
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'LocalTune',
      artUrl: getArtworkUrl(track, 512)
    });
  }

  // Native Android WebView MediaSession Bridge
  if (window.AndroidMediaBridge && typeof window.AndroidMediaBridge.updateMetadata === 'function') {
    try {
      if (track) {
        window.AndroidMediaBridge.updateMetadata(
          track.title || 'Unknown Title',
          track.artist || 'Unknown Artist',
          track.album || 'LocalTune',
          getArtworkUrl(track, 512)
        );
      } else {
        window.AndroidMediaBridge.clearMetadata();
      }
    } catch (e) {}
  }

  if (!('mediaSession' in navigator)) return;

  if (!track) {
    navigator.mediaSession.metadata = null;
    return;
  }

  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title || 'Unknown Title',
      artist: track.artist || 'Unknown Artist',
      album: track.album || 'LocalTune',
      artwork: getMultiSizeArtwork(track)
    });
  } catch (err) {
    console.warn('[MediaMetadataProvider] Error setting MediaSession metadata:', err);
  }
}

export function setupMediaSessionActionHandlers(actions = {}) {
  if (!('mediaSession' in navigator)) return;

  const actionMap = {
    play: actions.onPlay,
    pause: actions.onPause,
    previoustrack: actions.onPrev,
    nexttrack: actions.onNext,
    seekto: (details) => actions.onSeekTo && actions.onSeekTo(details.seekTime),
    seekbackward: (details) => actions.onSeekBackward && actions.onSeekBackward(details.seekOffset || 10),
    seekforward: (details) => actions.onSeekForward && actions.onSeekForward(details.seekOffset || 10),
    stop: actions.onStop
  };

  Object.entries(actionMap).forEach(([action, handler]) => {
    try {
      if (handler) {
        navigator.mediaSession.setActionHandler(action, handler);
      } else {
        navigator.mediaSession.setActionHandler(action, null);
      }
    } catch (e) {
      // Action handler not supported by browser
    }
  });
}

export function updateMediaSessionPositionState(positionData = {}) {
  const { duration = 0, playbackRate = 1, position = 0, isPlaying = true } = positionData;

  syncServerPlaybackState({
    isPlaying,
    position,
    duration
  });

  if (window.AndroidMediaBridge && typeof window.AndroidMediaBridge.updatePlaybackState === 'function') {
    try {
      window.AndroidMediaBridge.updatePlaybackState(isPlaying, position, duration);
    } catch (e) {}
  }

  if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;

  try {
    if (duration > 0 && position >= 0 && position <= duration) {
      navigator.mediaSession.setPositionState({
        duration: Math.max(0, duration),
        playbackRate: Math.max(0.5, playbackRate),
        position: Math.max(0, Math.min(position, duration))
      });
    }
  } catch (err) {
    // Ignore invalid state updates
  }
}

export const MediaMetadataProvider = {
  getArtworkUrl,
  getMultiSizeArtwork,
  updateMediaSessionMetadata,
  setupMediaSessionActionHandlers,
  updateMediaSessionPositionState
};

export default MediaMetadataProvider;
