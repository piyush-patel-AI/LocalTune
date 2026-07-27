import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';

const PlayerContext = createContext();

export const PlayerProvider = ({ children }) => {
  const { user } = useAuth();
  const audioRef = useRef(new Audio());
  
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off'); // 'off', 'all', 'one'
  const [favoritesMap, setFavoritesMap] = useState({}); // trackId -> true
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    try {
      const saved = localStorage.getItem('localtune_recently_played');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Sync audio element events
  useEffect(() => {
    const audio = audioRef.current;
    audio.volume = volume;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration || 0);
    const handleEnded = () => handleNextEnded();
    const handleError = (e) => {
      console.error('[Audio Error]', e);
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [queue, queueIndex, repeat, shuffle]);

  const [originalQueue, setOriginalQueue] = useState([]);

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
    setShuffle(nextState);
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
    audio.src = `/stream/${track.id}`;
    audio.play().then(() => {
      setIsPlaying(true);
    }).catch(err => {
      console.error('Playback error:', err);
      setIsPlaying(false);
    });
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    const audio = audioRef.current;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleNextEnded = () => {
    if (repeat === 'one') {
      const audio = audioRef.current;
      audio.currentTime = 0;
      audio.play();
      return;
    }
    nextTrack();
  };

  const nextTrack = () => {
    if (queue.length === 0) return;

    let nextIdx = queueIndex + 1;
    if (shuffle) {
      nextIdx = Math.floor(Math.random() * queue.length);
    }

    if (nextIdx < queue.length) {
      setQueueIndex(nextIdx);
      playTrack(queue[nextIdx]);
    } else if (repeat === 'all') {
      setQueueIndex(0);
      playTrack(queue[0]);
    } else {
      setIsPlaying(false);
    }
  };

  const prevTrack = () => {
    if (queue.length === 0) return;
    
    // If audio played > 3s, restart current song
    if (audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    let prevIdx = queueIndex - 1;
    if (prevIdx >= 0) {
      setQueueIndex(prevIdx);
      playTrack(queue[prevIdx]);
    } else if (repeat === 'all') {
      const lastIdx = queue.length - 1;
      setQueueIndex(lastIdx);
      playTrack(queue[lastIdx]);
    }
  };

  const seek = (time) => {
    const audio = audioRef.current;
    audio.currentTime = time;
    setCurrentTime(time);
  };

  const setVolume = (val) => {
    setVolumeState(val);
    audioRef.current.volume = val;
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
      setRepeat: (r) => setRepeat(r),
      toggleFavorite,
      addToQueue,
      removeFromQueue,
      reorderQueue,
      loadFavorites
    }}>
      {children}
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
