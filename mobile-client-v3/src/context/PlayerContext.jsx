import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';
import { recommendationService } from '../services/recommendationService.js';
import { resolveArtworkUrl } from '../services/ambientColor.js';
import {
  isNativeBridgeAvailable,
  logToNative,
  pushTrackMetadata,
  pushPlaybackState,
} from '../services/nativeBridge.js';
import { shuffleArray, shuffleUpcoming, nextPlaybackAfterEnd } from '../services/playerModes.js';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const audioRef = useRef(null);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const [isPlayerExpanded, setPlayerExpanded] = useState(false);
  const [favoritesMap, setFavoritesMap] = useState({});
  const [activeTab, setActiveTab] = useState('home'); // home | explore | library | search
  const [listenHistory, setListenHistory] = useState([]);
  const [repeatMode, setRepeatMode] = useState('off'); // 'off' | 'queue' | 'one'
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

  // Base (non-shuffled) queue order, so toggling shuffle OFF restores the order
  // the user actually built instead of permanently destroying it.
  const originalQueueRef = useRef([]);

  // Fetch user favorites on load
  const refreshFavorites = async () => {
    try {
      const favs = await api.getFavorites();
      const map = {};
      (favs.favorites || favs || []).forEach((f) => {
        const id = typeof f === 'object' ? f.id : f;
        map[id] = true;
      });
      setFavoritesMap(map);
    } catch (_) {}
  };

  useEffect(() => {
    refreshFavorites();
  }, []);

  // Audio event listeners
  useEffect(() => {
    const audio = audioRef.current;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => setDuration(audio.duration || 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => handleTrackEnded();

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
    };
  }, [queue, queueIndex, currentTrack]);

  // MediaSession synchronization
  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentTrack.title || 'Unknown Track',
      artist: currentTrack.artist || 'Unknown Artist',
      album: currentTrack.album || 'LocalTune',
      artwork: [
        {
          src: currentTrack.coverUrl || currentTrack.cover_art_url || api.getTrackArtUrl(currentTrack.id),
          sizes: '512x512',
          type: 'image/jpeg',
        },
      ],
    });

    navigator.mediaSession.setActionHandler('play', () => audioRef.current.play());
    navigator.mediaSession.setActionHandler('pause', () => audioRef.current.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        audioRef.current.currentTime = details.seekTime;
      }
    });
  }, [currentTrack]);

  // Native MediaSession playbackState sync (observed by the Android bridge polyfill)
  useEffect(() => {
    if (!currentTrack || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying]);

  // Periodic position sync while playing (keeps Android Now Bar scrub in step)
  useEffect(() => {
    if (!currentTrack || !isPlaying || !('mediaSession' in navigator)) return;
    const audio = audioRef.current;
    if (!audio) return;

    const syncPosition = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
      const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
      if (duration <= 0 || position < 0 || position > duration) return;
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position,
          playbackRate: audio.playbackRate || 1,
        });
      } catch (_) {}
    };

    syncPosition();
    const positionInterval = setInterval(syncPosition, 1000);
    return () => clearInterval(positionInterval);
  }, [currentTrack, isPlaying]);

  // Direct push of real track metadata into the existing AndroidMediaBridge JS
  // interface (Octave WebView). This is the same native method the injected
  // polyfill calls; driving it directly covers devices whose navigator does
  // not expose navigator.mediaSession, so the Now Bar never falls back to the
  // generic "Octave / Streaming Music" placeholders.
  useEffect(() => {
    if (!currentTrack || !isNativeBridgeAvailable()) return;
    const audio = audioRef.current;
    const trackDuration =
      audio && Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : currentTrack.duration_seconds || duration || 0;

    pushTrackMetadata({
      title: currentTrack.title || 'Unknown Track',
      artist: currentTrack.artist || 'Unknown Artist',
      album: currentTrack.album || 'LocalTune',
      artwork: resolveArtworkUrl(currentTrack),
      duration: trackDuration,
    });
    logToNative(`V3 metadata for track #${currentTrack.id}: ${JSON.stringify(currentTrack.title)} - ${JSON.stringify(currentTrack.artist)}`);
  }, [currentTrack, duration]);

  // Direct play/pause + position/duration push on track/state transitions.
  // Ongoing position while playing is additionally driven by the polyfill's
  // 1s DOM-audio heartbeat, so this covers the instant edges.
  useEffect(() => {
    if (!currentTrack || !isNativeBridgeAvailable()) return;
    const audio = audioRef.current;
    const position =
      audio && Number.isFinite(audio.currentTime) ? audio.currentTime : currentTime;
    const trackDuration =
      audio && Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : duration;
    pushPlaybackState(isPlaying, position, trackDuration);
    logToNative(`V3 playback: playing=${isPlaying}`);
  }, [currentTrack, isPlaying]);

  const playTrack = (track, newQueue = null, index = 0) => {
    if (!track) return;
    const audio = audioRef.current;

    if (currentTrack && currentTrack.id === track.id) {
      if (audio.paused) {
        audio.play().catch(console.error);
      }
      return;
    }

    setCurrentTrack(track);
    setListenHistory((prev) => [...prev, track]);

    if (newQueue) {
      originalQueueRef.current = [...newQueue];
      setQueue(shuffleEnabled ? shuffleUpcoming(newQueue, index) : newQueue);
      setQueueIndex(index);
    } else if (queue.length === 0) {
      setQueue([track]);
      setQueueIndex(0);
    }

    const streamUrl = track.streamUrl || track.url || api.getStreamUrl(track.id);
    audio.src = streamUrl;
    audio.play().catch(console.error);

    recommendationService.logAction({
      trackId: track.id,
      action: 'play',
      surface: activeTab,
    });
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!currentTrack && queue.length > 0) {
      playTrack(queue[0], queue, 0);
      return;
    }
    if (audio.paused) {
      audio.play().catch(console.error);
    } else {
      audio.pause();
    }
  };

  const seek = (time) => {
    const audio = audioRef.current;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const nextTrack = async () => {
    if (queueIndex + 1 < queue.length) {
      const nextIdx = queueIndex + 1;
      setQueueIndex(nextIdx);
      playTrack(queue[nextIdx], queue, nextIdx);
    } else if (currentTrack) {
      // Repeat-queue wrap: return to the top of the (possibly re-shuffled)
      // queue instead of fetching recommendations.
      if (repeatMode === 'queue' && queue.length > 0) {
        const nextCycle = shuffleEnabled ? shuffleArray(queue) : queue;
        setQueueIndex(0);
        playTrack(nextCycle[0], nextCycle, 0);
        return;
      }
      try {
        const exclude = queue.map((t) => t.id);
        const autoplayTracks = await recommendationService.getAutoplayTracks(currentTrack.id, exclude, 3);
        if (autoplayTracks.length > 0) {
          const newQueue = [...queue, ...autoplayTracks];
          const nextIdx = queueIndex + 1;
          setQueue(newQueue);
          setQueueIndex(nextIdx);
          playTrack(newQueue[nextIdx], newQueue, nextIdx);
        }
      } catch (_) {}
    }
  };

  const prevTrack = () => {
    if (currentTime > 3) {
      seek(0);
      return;
    }
    if (queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      setQueueIndex(prevIdx);
      playTrack(queue[prevIdx], queue, prevIdx);
    } else {
      seek(0);
    }
  };

  // Single decision path for HTML5 audio `ended`. Resolves repeat-one vs repeat
  // queue vs shuffle vs normal advancement vs V2 recommendation autoplay in ONE
  // place. Repeat-one restarts the SAME track (no queueIndex change, no
  // recommendation request); repeat-queue wraps without growing the queue; only
  // an exhausted queue with repeat OFF falls through to recommendation autoplay.
  const handleTrackEnded = () => {
    if (currentTrack) {
      api.logListen(currentTrack.id, duration, true);
    }
    const decision = nextPlaybackAfterEnd({ repeatMode, queue, queueIndex, shuffleEnabled });
    switch (decision.action) {
      case 'replay': {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(console.error);
        }
        return;
      }
      case 'advance': {
        const nextIdx = decision.index;
        setQueueIndex(nextIdx);
        playTrack(queue[nextIdx], queue, nextIdx);
        return;
      }
      case 'wrap': {
        const nextCycle = decision.shuffle ? shuffleArray(queue) : queue;
        setQueueIndex(0);
        playTrack(nextCycle[0], nextCycle, 0);
        return;
      }
      default:
        nextTrack();
    }
  };

  const cycleRepeat = () => {
    setRepeatMode((mode) => (mode === 'off' ? 'queue' : mode === 'queue' ? 'one' : 'off'));
  };

  const toggleShuffle = () => {
    if (shuffleEnabled) {
      // OFF: restore the base queue order, keeping the current track in place.
      setShuffleEnabled(false);
      const original = originalQueueRef.current;
      if (original.length) {
        if (currentTrack) {
          const idx = original.findIndex((t) => t.id === currentTrack.id);
          if (idx !== -1) {
            setQueue(original);
            setQueueIndex(idx);
            return;
          }
        }
        setQueue(original);
      }
      return;
    }
    // ON: snapshot the base order, then randomize ONLY the upcoming tracks so
    // the currently playing track is never replaced or immediately replayed.
    originalQueueRef.current = [...queue];
    if (queueIndex >= 0 && queue.length > 1) {
      setQueue(shuffleUpcoming(queue, queueIndex));
    } else if (queue.length > 1) {
      setQueue(shuffleArray(queue));
    }
    setShuffleEnabled(true);
  };

  const toggleFavorite = async (trackId) => {
    const isFav = !!favoritesMap[trackId];
    try {
      if (isFav) {
        await api.removeFavorite(trackId);
        setFavoritesMap((prev) => {
          const copy = { ...prev };
          delete copy[trackId];
          return copy;
        });
      } else {
        await api.addFavorite(trackId);
        setFavoritesMap((prev) => ({ ...prev, [trackId]: true }));
      }
    } catch (err) {
      console.warn('Failed to toggle favorite:', err);
    }
  };

  const addToQueue = (track) => {
    setQueue((prev) => {
      const next = [...prev, track];
      originalQueueRef.current = [...next];
      return next;
    });
  };

  const playNext = (track) => {
    setQueue((prev) => {
      const copy = [...prev];
      copy.splice(queueIndex + 1, 0, track);
      originalQueueRef.current = [...copy];
      return copy;
    });
  };

  // Drag and drop reordering function preserving currentTrack identity
  const reorderQueue = (fromIndex, toIndex) => {
    if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;
    setQueue((prevQueue) => {
      const newQueue = [...prevQueue];
      const [movedItem] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedItem);
      originalQueueRef.current = [...newQueue];

      if (currentTrack) {
        const newCurrentIndex = newQueue.findIndex((t) => t.id === currentTrack.id);
        if (newCurrentIndex !== -1) {
          setQueueIndex(newCurrentIndex);
        }
      }
      return newQueue;
    });
  };

  const removeFromQueue = (index) => {
    if (index < 0 || index >= queue.length) return;
    setQueue((prevQueue) => {
      const newQueue = [...prevQueue];
      newQueue.splice(index, 1);
      originalQueueRef.current = [...newQueue];

      if (currentTrack) {
        const newCurrentIndex = newQueue.findIndex((t) => t.id === currentTrack.id);
        if (newCurrentIndex !== -1) {
          setQueueIndex(newCurrentIndex);
        } else if (newQueue.length > 0) {
          const nextIdx = Math.min(index, newQueue.length - 1);
          setQueueIndex(nextIdx);
        } else {
          setQueueIndex(-1);
        }
      }
      return newQueue;
    });
  };

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        queue,
        queueIndex,
        isPlayerExpanded,
        setPlayerExpanded,
        favoritesMap,
        activeTab,
        setActiveTab,
        listenHistory,
        playTrack,
        togglePlay,
        seek,
        nextTrack,
        prevTrack,
        repeatMode,
        shuffleEnabled,
        cycleRepeat,
        toggleShuffle,
        toggleFavorite,
        addToQueue,
        playNext,
        setQueue,
        reorderQueue,
        removeFromQueue,
      }}
    >
      <audio ref={audioRef} preload="auto" style={{ display: 'none' }} />
      {/* Persistent DOM fallbacks matching the injected Octave polyfill selectors
          ([aria-label="Next"] / [aria-label="Previous"]) so native next/previous
          commands reach PlayerContext even when navigator.mediaSession is
          unavailable. PlayerContext remains the single source of truth. */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <button type="button" aria-label="Next" onClick={nextTrack} />
        <button type="button" aria-label="Previous" onClick={prevTrack} />
      </div>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider');
  return ctx;
}
