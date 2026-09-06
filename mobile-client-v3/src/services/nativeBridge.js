/**
 * mobile-client-v3/src/services/nativeBridge.js
 *
 * Direct driver for the EXISTING Octave AndroidMediaBridge JS interface
 * (com.example.octave.AndroidMediaBridge / window.AndroidMediaBridge).
 *
 * The injected WebView polyfill watches navigator.mediaSession and calls these
 * same methods, but that observation layer is inactive on WebViews that do not
 * expose the MediaSession API. Both paths call the exact same native methods
 * (updateMetadata / updatePlaybackState / logDebug), so driving the bridge
 * directly when the interface is present requires no new native integration
 * and no second bridge.
 */

function getBridge() {
  if (typeof globalThis === 'undefined') return undefined;
  const direct =
    typeof globalThis.AndroidMediaBridge !== 'undefined'
      ? globalThis.AndroidMediaBridge
      : undefined;
  if (direct) return direct;
  if (
    typeof globalThis.window !== 'undefined' &&
    typeof globalThis.window.AndroidMediaBridge !== 'undefined'
  ) {
    return globalThis.window.AndroidMediaBridge;
  }
  return undefined;
}

export function isNativeBridgeAvailable() {
  return typeof getBridge() !== 'undefined';
}

/**
 * Push the real current-track metadata to the native media session.
 * Mirrors the injected polyfill's AndroidMediaBridge.updateMetadata(...).
 */
export function pushTrackMetadata({ title, artist, album, artwork, duration } = {}) {
  const bridge = getBridge();
  if (!bridge) return false;
  try {
    bridge.updateMetadata(
      title || '',
      artist || '',
      album || '',
      artwork || '',
      typeof duration === 'number' && Number.isFinite(duration) ? duration : 0
    );
    return true;
  } catch (err) {
    console.error('[nativeBridge] updateMetadata failed:', err);
    return false;
  }
}

/**
 * Push play/pause state + position/duration to the native media session.
 * Mirrors the injected polyfill's AndroidMediaBridge.updatePlaybackState(...).
 */
export function pushPlaybackState(isPlaying, position, duration) {
  const bridge = getBridge();
  if (!bridge) return false;
  try {
    bridge.updatePlaybackState(
      !!isPlaying,
      typeof position === 'number' && Number.isFinite(position) ? position : 0,
      typeof duration === 'number' && Number.isFinite(duration) ? duration : 0
    );
    return true;
  } catch (err) {
    console.error('[nativeBridge] updatePlaybackState failed:', err);
    return false;
  }
}

/** Send a diagnostic line into the native Logcat stream (TAG "OctaveBridge"). */
export function logToNative(message) {
  const bridge = getBridge();
  if (!bridge) return false;
  try {
    bridge.logDebug(String(message));
    return true;
  } catch (_) {
    return false;
  }
}

export const nativeBridge = {
  isAvailable: isNativeBridgeAvailable,
  pushTrackMetadata,
  pushPlaybackState,
  logToNative,
};