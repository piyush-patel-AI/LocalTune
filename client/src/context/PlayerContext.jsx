import { createContext, useContext, useState, useRef, useEffect } from 'react';
import logo from '../../../Assets/logo.png';
import { useAuth } from './AuthContext';
import { extractColorsFromAlbumArt, applyAmbientColorsToDOM, getDefaultAmbientColors } from '../utils/colorExtractor';
import { apiClient } from '../services/apiClient';
import { LocalTuneEvents } from '../services/LocalTuneEvents';
import { MediaMetadataProvider } from '../services/MediaMetadataProvider';
import { LocalTuneBridge } from '../services/LocalTuneBridge';

const PlayerContext = createContext();

export const PlayerProvider = ({ children }) => {
  const { user } = useAuth();
  const audioRef = useRef(null);
  
  const [currentTrack, setCurrentTrack] = useState(() => {
    try {
      const saved = localStorage.getItem('localtune_last_track');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [initialPosition] = useState(() => {
    try {
      const saved = localStorage.getItem('localtune_last_position');
      const parsed = saved ? parseFloat(saved) : 0;
      return isNaN(parsed) ? 0 : parsed;
    } catch {
      return 0;
    }
  });

  const [isPlaying, setIsPlaying] = useState(false);

  const [queue, setQueue] = useState(() => {
    try {
      const saved = localStorage.getItem('localtune_last_queue');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [queueIndex, setQueueIndex] = useState(() => {
    try {
      const saved = localStorage.getItem('localtune_last_queue_index');
      const parsed = saved ? parseInt(saved, 10) : 0;
      return isNaN(parsed) ? 0 : parsed;
    } catch {
      return 0;
    }
  });

  const [currentTime, setCurrentTime] = useState(initialPosition);
  const [duration, setDuration] = useState(() => currentTrack?.duration_seconds || 0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffleState] = useState(false);
  const [repeat, setRepeatState] = useState('off'); // 'off', 'all', 'one'
  const [favoritesMap, setFavoritesMap] = useState({}); // trackId -> true
  const [originalQueue, setOriginalQueue] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    try {
      const saved = localStorage.getItem('localtune_recently_played');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const restoredTimeRef = useRef(initialPosition);
  const lastSavedTimeRef = useRef(initialPosition);

  // Keep refs in sync to avoid stale closures in event handlers
  const isPlayingRef = useRef(isPlaying);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const currentTrackRef = useRef(currentTrack);
  const favoritesMapRef = useRef(favoritesMap);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { favoritesMapRef.current = favoritesMap; }, [favoritesMap]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  // Save playback state & update dynamic ambient colors on track change
  useEffect(() => {
    let isCancelled = false;

    try {
      if (currentTrack) {
        localStorage.setItem('localtune_last_track', JSON.stringify(currentTrack));
        const artUrl = currentTrack.coverUrl || currentTrack.cover_art_url || `/api/tracks/${currentTrack.id}/art`;

        extractColorsFromAlbumArt(artUrl).then((colors) => {
          if (!isCancelled) {
            applyAmbientColorsToDOM(colors);
          }
        });
      } else {
        localStorage.removeItem('localtune_last_track');
        applyAmbientColorsToDOM(getDefaultAmbientColors());
      }
    } catch (e) {}

    return () => {
      isCancelled = true;
    };
  }, [currentTrack]);

  useEffect(() => {
    try {
      localStorage.setItem('localtune_last_queue', JSON.stringify(queue));
      localStorage.setItem('localtune_last_queue_index', queueIndex.toString());
    } catch (e) {}
  }, [queue, queueIndex]);

  // Restore audio source & seek position on initial mount
  useEffect(() => {
    if (currentTrack && audioRef.current) {
      audioRef.current.src = `/stream/${currentTrack.id}?ngrok-skip-browser-warning=69420`;
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (audioRef.current && currentTrackRef.current) {
        try {
          const curTime = audioRef.current.currentTime || 0;
          localStorage.setItem('localtune_last_position', curTime.toString());
          localStorage.setItem('localtune_last_track', JSON.stringify(currentTrackRef.current));
          localStorage.setItem('localtune_last_queue', JSON.stringify(queueRef.current));
          localStorage.setItem('localtune_last_queue_index', queueIndexRef.current.toString());
        } catch (e) {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Sync MediaSession metadata and position state
  useEffect(() => {
    MediaMetadataProvider.updateMediaSessionMetadata(currentTrack);
    LocalTuneEvents.emit('playback.trackChanged', { track: currentTrack });
  }, [currentTrack]);

  useEffect(() => {
    MediaMetadataProvider.updateMediaSessionPositionState({
      duration,
      playbackRate: 1,
      position: currentTime
    });
  }, [currentTime, duration]);

  // Register LocalTuneBridge controller & MediaSession action handlers
  useEffect(() => {
    const controller = {
      play: () => {
        if (audioRef.current && currentTrackRef.current) {
          audioRef.current.play().then(() => {
            setIsPlaying(true);
            LocalTuneEvents.emit('playback.started', { track: currentTrackRef.current });
          }).catch(err => {
            LocalTuneEvents.emit('bridge.error', { message: err.message, type: 'PLAY_FAILED' });
          });
        }
      },
      pause: () => {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
          LocalTuneEvents.emit('playback.paused', { track: currentTrackRef.current });
        }
      },
      toggle: () => {
        if (isPlayingRef.current) {
          if (audioRef.current) {
            audioRef.current.pause();
            setIsPlaying(false);
            LocalTuneEvents.emit('playback.paused', { track: currentTrackRef.current });
          }
        } else {
          if (audioRef.current && currentTrackRef.current) {
            audioRef.current.play().then(() => {
              setIsPlaying(true);
              LocalTuneEvents.emit('playback.started', { track: currentTrackRef.current });
            }).catch(err => {
              LocalTuneEvents.emit('bridge.error', { message: err.message, type: 'PLAY_FAILED' });
            });
          }
        }
      },
      nextTrack: () => nextTrack(),
      prevTrack: () => prevTrack(),
      seek: (seconds) => seek(seconds),
      setVolume: (v) => setVolume(v),
      setShuffle: (b) => toggleShuffle(b),
      setRepeat: (m) => setRepeatState(m),
      getCurrentTrack: () => currentTrackRef.current,
      getIsPlaying: () => isPlayingRef.current,
      getQueue: () => queueRef.current,
      getQueueIndex: () => queueIndexRef.current,
      getCurrentTime: () => currentTimeRef.current,
      getDuration: () => durationRef.current,
      setQueue: (items) => setQueue(items),
      addTrackToQueue: (t) => addToQueue(t),
      removeTrackFromQueue: (idx) => removeFromQueue(idx),
      isFavorite: (id) => !!favoritesMapRef.current[id],
      toggleFavorite: (id) => toggleFavorite(id),
      setFavorite: async (id, isFav) => {
        if (!!favoritesMapRef.current[id] !== isFav) {
          await toggleFavorite(id);
        }
      },
      getBrowsableLibrary: async () => {
        try {
          const [tracksRes, playlistsRes] = await Promise.all([
            apiClient.get('/api/tracks'),
            apiClient.get('/api/playlists')
          ]);
          return {
            tracks: tracksRes.tracks || [],
            playlists: playlistsRes.playlists || []
          };
        } catch (err) {
          return { tracks: [], playlists: [] };
        }
      },
      searchLibrary: async (q) => {
        try {
          const res = await apiClient.get(`/api/tracks?search=${encodeURIComponent(q)}`);
          return res.tracks || [];
        } catch (err) {
          return [];
        }
      }
    };

    LocalTuneBridge.init(controller);

    MediaMetadataProvider.setupMediaSessionActionHandlers({
      onPlay: () => controller.play(),
      onPause: () => controller.pause(),
      onPrev: () => controller.prevTrack(),
      onNext: () => controller.nextTrack(),
      onSeekTo: (time) => controller.seek(time),
      onStop: () => controller.pause()
    });

    return () => {
      LocalTuneBridge.destroy();
    };
  }, []);

  // Sync volume with audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Load user favorites when authenticated
  const loadFavorites = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/favorites', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.favorites || []).forEach(t => { map[t.id] = true; });
        setFavoritesMap(map);
      }
    } catch (err) {
      console.error('Failed loading favorites', err);
    }
  };

  useEffect(() => {
    if (user) {
      loadFavorites();
    } else {
      setFavoritesMap({});
    }
  }, [user]);

  const recordRecentlyPlayed = (track) => {
    if (!track) return;
    setRecentlyPlayed(prev => {
      const filtered = prev.filter(t => t.id !== track.id);
      const updated = [track, ...filtered].slice(0, 12);
      try {
        localStorage.setItem('localtune_recently_played', JSON.stringify(updated));
      } catch (err) {
        console.error('Failed saving recently played', err);
      }
      return updated;
    });
  };

  const clearRecentlyPlayed = () => {
    setRecentlyPlayed([]);
    try {
      localStorage.removeItem('localtune_recently_played');
    } catch (err) {
      console.error('Failed clearing recently played', err);
    }
  };

  const shuffleQueue = () => {
    if (queue.length <= 1) return;
    const current = queue[queueIndex] || currentTrack;
    const remaining = queue.filter((_, idx) => idx !== queueIndex);

    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    const newQueue = current ? [current, ...remaining] : remaining;
    setQueue(newQueue);
    setQueueIndex(0);
  };

  const toggleShuffle = () => {
    const nextState = !shuffle;
    setShuffleState(nextState);
    if (nextState) {
      if (originalQueue.length === 0) {
        setOriginalQueue([...queue]);
      }
      shuffleQueue();
    } else if (originalQueue.length > 0) {
      setQueue(originalQueue);
      if (currentTrack) {
        const idx = originalQueue.findIndex((t) => t.id === currentTrack.id);
        setQueueIndex(idx !== -1 ? idx : 0);
      }
      setOriginalQueue([]);
    }
  };

  const telemetryRef = useRef({
    trackId: null,
    listenedSeconds: 0,
    duration: 0,
    previousTrackId: null,
    lastTime: 0
  });

  const sendTelemetry = (newTrackId = null) => {
    const cur = telemetryRef.current;
    if (cur.trackId && cur.listenedSeconds >= 1) {
      const isReplay = newTrackId === cur.trackId;
      fetch('/api/stats/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trackId: cur.trackId,
          listenedSeconds: cur.listenedSeconds,
          durationSeconds: cur.duration,
          isReplay,
          previousTrackId: cur.previousTrackId
        })
      }).catch(() => {});
    }
  };

  const playTrack = (track, newQueue = null) => {
    if (!track) return;

    restoredTimeRef.current = 0;
    recordRecentlyPlayed(track);

    sendTelemetry(track.id);
    const prevTrackId = currentTrackRef.current ? currentTrackRef.current.id : null;
    telemetryRef.current = {
      trackId: track.id,
      listenedSeconds: 0,
      duration: track.duration_seconds || 0,
      previousTrackId: prevTrackId,
      lastTime: 0
    };

    if (newQueue) {
      setQueue(newQueue);
      setOriginalQueue([...newQueue]);
      const idx = newQueue.findIndex(t => t.id === track.id);
      setQueueIndex(idx !== -1 ? idx : 0);
    } else if (queue.length === 0) {
      setQueue([track]);
      setOriginalQueue([track]);
      setQueueIndex(0);
    }

    setCurrentTrack(track);
    const audio = audioRef.current;
    if (audio) {
      const streamUrl = `/stream/${track.id}?ngrok-skip-browser-warning=69420`;
      try {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      } catch (e) {
        // ignore reset errors
      }
      audio.src = streamUrl;
      audio.currentTime = 0;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(err => {
          if (err.name !== 'AbortError') {
            console.error('[Playback Error]', err);
            setIsPlaying(false);
          }
        });
      }
    }
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          setIsPlaying(true);
        }).catch(err => {
          if (err.name !== 'AbortError') {
            console.error('[Toggle Play Error]', err);
            setIsPlaying(false);
          }
        });
      }
    }
  };

  const [autoplay, setAutoplay] = useState(true);

  const fetchAutoplayTracks = async () => {
    try {
      const curTrackId = currentTrackRef.current ? currentTrackRef.current.id : null;
      const q = queueRef.current;
      const excludeIds = q.map((t) => t.id).join(',');

      const res = await fetch(`/api/tracks/recommendations/autoplay?currentTrackId=${curTrackId || ''}&exclude=${excludeIds}&count=5`, {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tracks && data.tracks.length > 0) {
          const newQueue = [...q, ...data.tracks];
          const nextIdx = q.length;
          setQueue(newQueue);
          setQueueIndex(nextIdx);
          playTrack(data.tracks[0]);
          return;
        }
      }
    } catch (err) {
      console.error('[Autoplay Error] Failed fetching autoplay tracks:', err);
    }
    setIsPlaying(false);
  };

  const nextTrack = () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    const isShuf = shuffleRef.current;
    const rep = repeatRef.current;

    if (q.length === 0) return;

    let nextIdx = idx + 1;
    if (isShuf) {
      nextIdx = Math.floor(Math.random() * q.length);
    }

    if (nextIdx < q.length) {
      setQueueIndex(nextIdx);
      playTrack(q[nextIdx]);
    } else if (rep === 'all') {
      setQueueIndex(0);
      playTrack(q[0]);
    } else if (autoplay) {
      fetchAutoplayTracks();
    } else {
      setIsPlaying(false);
    }
  };

  const prevTrack = () => {
    const q = queueRef.current;
    const idx = queueIndexRef.current;
    const rep = repeatRef.current;

    if (q.length === 0) return;
    
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    let prevIdx = idx - 1;
    if (prevIdx >= 0) {
      setQueueIndex(prevIdx);
      playTrack(q[prevIdx]);
    } else if (rep === 'all') {
      const lastIdx = q.length - 1;
      setQueueIndex(lastIdx);
      playTrack(q[lastIdx]);
    }
  };

  const handleEnded = () => {
    const rep = repeatRef.current;
    if (rep === 'one') {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
      return;
    }
    nextTrack();
  };

  const seek = (time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (val) => {
    setVolumeState(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
  };

  const toggleFavorite = async (trackId) => {
    const isFav = !!favoritesMap[trackId];
    const newMap = { ...favoritesMap };

    if (isFav) {
      delete newMap[trackId];
      setFavoritesMap(newMap);
      await fetch(`/api/favorites/${trackId}`, { method: 'DELETE', credentials: 'include' });
    } else {
      newMap[trackId] = true;
      setFavoritesMap(newMap);
      await fetch(`/api/favorites/${trackId}`, { method: 'POST', credentials: 'include' });
    }
  };

  const addToQueue = (track) => {
    setQueue(prev => [...prev, track]);
  };

  const removeFromQueue = (index) => {
    setQueue(prev => prev.filter((_, i) => i !== index));
    if (index < queueIndex) {
      setQueueIndex(prev => prev - 1);
    }
  };

  const reorderQueue = (newQueue) => {
    setQueue(newQueue);
    if (currentTrack) {
      const idx = newQueue.findIndex(t => t.id === currentTrack.id);
      if (idx !== -1) setQueueIndex(idx);
    }
  };

  // Web MediaSession API Integration (Android / iOS Lock Screen & System Notification Controls)
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (currentTrack) {
      const artUrl = currentTrack.cover_art_path
        ? `${window.location.origin}/api/tracks/${currentTrack.id}/art`
        : logo;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Octave',
        album: currentTrack.album || 'Octave Library',
        artwork: [
          { src: artUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: artUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: artUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: artUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: artUrl, sizes: '512x512', type: 'image/jpeg' },
        ]
      });
    }

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [currentTrack, isPlaying]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const actionHandlers = [
      ['play', () => { togglePlay(); }],
      ['pause', () => { togglePlay(); }],
      ['previoustrack', () => { prevTrack(); }],
      ['nexttrack', () => { nextTrack(); }],
      ['seekto', (details) => { if (details.seekTime !== undefined) seek(details.seekTime); }]
    ];

    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {
        // action not supported by browser
      }
    }
  }, []);

  return (
    <PlayerContext.Provider value={{
      currentTrack,
      isPlaying,
      queue,
      queueIndex,
      currentTime,
      duration,
      volume,
      shuffle,
      repeat,
      autoplay,
      setAutoplay,
      favoritesMap,
      recentlyPlayed,
      clearRecentlyPlayed,
      playTrack,
      togglePlay,
      nextTrack,
      prevTrack,
      seek,
      setVolume,
      setShuffle: toggleShuffle,
      toggleShuffle,
      shuffleQueue,
      setRepeat: (r) => setRepeatState(r),
      toggleFavorite,
      addToQueue,
      removeFromQueue,
      reorderQueue,
      loadFavorites
    }}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        style={{ display: 'none' }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            const cur = audioRef.current.currentTime;
            const dur = audioRef.current.duration || 0;
            setCurrentTime(cur);
            if (!isNaN(dur) && dur > 0) setDuration(dur);

            if (Math.abs(cur - lastSavedTimeRef.current) >= 1) {
              lastSavedTimeRef.current = cur;
              try {
                localStorage.setItem('localtune_last_position', cur.toString());
              } catch (e) {}
            }

            const tel = telemetryRef.current;
            if (tel.trackId && tel.lastTime > 0 && cur > tel.lastTime && (cur - tel.lastTime) < 2) {
              tel.listenedSeconds += (cur - tel.lastTime);
              if (dur > 0) tel.duration = dur;
            }
            tel.lastTime = cur;
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            const dur = audioRef.current.duration || 0;
            if (!isNaN(dur) && dur > 0) setDuration(dur);
            if (restoredTimeRef.current > 0) {
              const targetTime = (dur > 0 && restoredTimeRef.current >= dur - 1) ? 0 : restoredTimeRef.current;
              audioRef.current.currentTime = targetTime;
              setCurrentTime(targetTime);
              restoredTimeRef.current = 0;
            }
          }
        }}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => {
          const mediaErr = e.target ? e.target.error : null;
          if (mediaErr && mediaErr.code === 1) return; // Ignore MEDIA_ERR_ABORTED
          console.error('[HTML5 Audio Error]', mediaErr || e);
          setIsPlaying(false);
        }}
      />
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};
