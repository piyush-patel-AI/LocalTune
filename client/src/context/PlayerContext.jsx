import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';

const PlayerContext = createContext();

export const PlayerProvider = ({ children }) => {
  const { user } = useAuth();
  const audioRef = useRef(null);
  
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
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

  // Keep refs in sync to avoid stale closures in event handlers
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(queueIndex);
  const repeatRef = useRef(repeat);
  const shuffleRef = useRef(shuffle);
  const currentTrackRef = useRef(currentTrack);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { queueIndexRef.current = queueIndex; }, [queueIndex]);
  useEffect(() => { repeatRef.current = repeat; }, [repeat]);
  useEffect(() => { shuffleRef.current = shuffle; }, [shuffle]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);

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

  const playTrack = (track, newQueue = null) => {
    if (!track) return;

    recordRecentlyPlayed(track);

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
      const streamUrl = `/stream/${track.id}`;
      audio.src = streamUrl;
      audio.currentTime = 0;
      audio.load();

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
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration || 0)}
        onEnded={handleEnded}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={(e) => {
          const mediaErr = e.target ? e.target.error : null;
          if (mediaErr && mediaErr.code === 1) return; // Ignore MEDIA_ERR_ABORTED
          
          if (mediaErr && mediaErr.message && mediaErr.message.includes('AUDIO_RENDERER_ERROR')) {
            console.warn('[Audio Renderer Warning] System sound card/output device switched or busy. Auto-retrying...');
            setTimeout(() => {
              if (audioRef.current && currentTrackRef.current) {
                audioRef.current.play().catch(() => {});
              }
            }, 300);
            return;
          }

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
