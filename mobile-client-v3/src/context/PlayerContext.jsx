import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api } from '../services/api.js';
import { recommendationService } from '../services/recommendationService.js';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const audioRef = useRef(new Audio());

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
      setQueue(newQueue);
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

  const handleTrackEnded = () => {
    if (currentTrack) {
      api.logListen(currentTrack.id, duration, true);
    }
    nextTrack();
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
    setQueue((prev) => [...prev, track]);
  };

  const playNext = (track) => {
    setQueue((prev) => {
      const copy = [...prev];
      copy.splice(queueIndex + 1, 0, track);
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
        toggleFavorite,
        addToQueue,
        playNext,
        setQueue,
        reorderQueue,
        removeFromQueue,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within a PlayerProvider');
  return ctx;
}
