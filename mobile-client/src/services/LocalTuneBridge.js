/**
 * LocalTuneBridge v1.0
 * Modular, platform-agnostic JavaScript Bridge connecting Native Android WebViews, Wear OS, 
 * MediaSession controllers, and external scripts to LocalTune's React audio state.
 */

import { LocalTuneEvents } from './LocalTuneEvents';
import { getArtworkUrl } from './MediaMetadataProvider';

class LocalTuneNativeBridge {
  constructor() {
    this.version = "1.0";
    this.controllerRef = null;
    this.isInitialized = false;
  }

  /**
   * Bind the active PlayerContext controller implementation
   */
  init(controller) {
    this.controllerRef = controller;
    this.isInitialized = true;

    // Attach to global window object
    if (typeof window !== 'undefined') {
      window.LocalTuneBridge = this;
    }

    // Emit bridge.ready event for Native Android wrapper
    LocalTuneEvents.emit('bridge.ready', {
      version: this.version,
      status: this.getStatus(),
      capabilities: this.getCapabilities()
    });
  }

  getStatus() {
    const track = this.controllerRef?.getCurrentTrack() || null;
    return {
      version: this.version,
      initialized: this.isInitialized,
      mediaSession: 'mediaSession' in navigator,
      playing: this.controllerRef?.getIsPlaying() || false,
      trackLoaded: !!track
    };
  }

  getCapabilities() {
    return {
      shuffle: true,
      repeat: true,
      seek: true,
      queue: true,
      favorites: true,
      lyrics: false,
      search: true,
      browsableLibrary: true
    };
  }

  /**
   * Playback Operations Sub-namespace
   */
  playback = {
    play: () => this.controllerRef?.play(),
    pause: () => this.controllerRef?.pause(),
    toggle: () => this.controllerRef?.toggle(),
    next: () => this.controllerRef?.nextTrack(),
    prev: () => this.controllerRef?.prevTrack(),
    seek: (seconds) => this.controllerRef?.seek(seconds),
    setVolume: (vol) => this.controllerRef?.setVolume(vol),
    setShuffle: (enabled) => this.controllerRef?.setShuffle(enabled),
    setRepeat: (mode) => this.controllerRef?.setRepeat(mode)
  };

  /**
   * Queue Operations Sub-namespace (returns immutable copies to avoid state corruption)
   */
  queue = {
    getQueue: () => {
      const q = this.controllerRef?.getQueue() || [];
      return JSON.parse(JSON.stringify(q));
    },
    getCurrentIndex: () => this.controllerRef?.getQueueIndex() || 0,
    setQueue: (items) => this.controllerRef?.setQueue(items),
    addTrack: (track) => this.controllerRef?.addTrackToQueue(track),
    removeTrack: (index) => this.controllerRef?.removeTrackFromQueue(index)
  };

  /**
   * Metadata & Track Inspection Sub-namespace
   */
  metadata = {
    getCurrentTrack: () => {
      const track = this.controllerRef?.getCurrentTrack() || null;
      return track ? JSON.parse(JSON.stringify(track)) : null;
    },
    getArtwork: (size = 512) => {
      const track = this.controllerRef?.getCurrentTrack() || null;
      return getArtworkUrl(track, size);
    },
    getPosition: () => {
      return {
        currentTime: this.controllerRef?.getCurrentTime() || 0,
        duration: this.controllerRef?.getDuration() || 0,
        playbackRate: 1
      };
    }
  };

  /**
   * Library & Voice Search Placeholders for Native Android Auto MediaBrowserService
   */
  library = {
    getBrowsableLibrary: async () => {
      return this.controllerRef?.getBrowsableLibrary() || { albums: [], artists: [], playlists: [] };
    },
    search: async (query) => {
      return this.controllerRef?.searchLibrary(query) || [];
    }
  };

  /**
   * Favorites Hooks
   */
  favorites = {
    isFavorite: (trackId) => this.controllerRef?.isFavorite(trackId) || false,
    toggleFavorite: (trackId) => this.controllerRef?.toggleFavorite(trackId),
    setFavorite: (trackId, isFav) => this.controllerRef?.setFavorite(trackId, isFav)
  };

  /**
   * Event Subscription Sub-namespace
   */
  events = {
    on: (event, callback) => LocalTuneEvents.on(event, callback),
    off: (event, callback) => LocalTuneEvents.off(event, callback),
    subscribe: (callback) => LocalTuneEvents.subscribe(callback),
    unsubscribe: (callback) => LocalTuneEvents.unsubscribe(callback)
  };

  destroy() {
    this.isInitialized = false;
    this.controllerRef = null;
    if (typeof window !== 'undefined' && window.LocalTuneBridge === this) {
      delete window.LocalTuneBridge;
    }
    LocalTuneEvents.clear();
  }
}

export const LocalTuneBridge = new LocalTuneNativeBridge();
export default LocalTuneBridge;
