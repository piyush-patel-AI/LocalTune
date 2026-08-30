import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';
import { extractColorsFromAlbumArt, applyAmbientColorsToDOM, getDefaultAmbientColors } from '../utils/colorExtractor';
import { apiClient } from '../services/apiClient';
import { LocalTuneEvents } from '../services/LocalTuneEvents';
import { MediaMetadataProvider } from '../services/MediaMetadataProvider';
import { LocalTuneBridge } from '../services/LocalTuneBridge';
import { apiUrl } from '../config';

const PlayerContext = createContext();

// Helper to generate dynamic ambient colors from track metadata/id
function getTrackAmbientColors(track) {
  if (!track) {
    return {
      c1: 'rgba(245, 158, 11, 0.14)',
      c2: 'rgba(168, 85, 247, 0.09)',
      c3: 'rgba(239, 68, 68, 0.06)'
    };
  }

  let hash = 0;
  const str = (track.id || '') + (track.title || '') + (track.artist || '');
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue1 = Math.abs(hash) % 360;
  const hue2 = (hue1 + 50) % 360;
  const hue3 = (hue1 + 140) % 360;

  return {
    c1: `hsla(${hue1}, 80%, 55%, 0.16)`,
    c2: `hsla(${hue2}, 75%, 50%, 0.10)`,
    c3: `hsla(${hue3}, 70%, 45%, 0.07)`
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

// Number of upcoming (after current) tracks we aim to keep available in the
// queue so playback doesn't die after only 2-3 songs.
const UPCOMING_TARGET = 10;

function dedupeTracksByID(list) {
  const seen = new Set();
  const out = [];
  for (const t of list) {
    if (!t || !t.id) continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

export function PlayerProvider({ children }) {
  // Restore initial state from localStorage if available
  const [currentTrack, setCurrentTrack] = useState(() => {
    try {
      const saved = localStorage.getItem('localTune_currentTrack');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [queue, setQueue] = useState(() => {
    try {
      const saved = localStorage.getItem('localTune_queue');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isShuffled, setIsShuffled] = useState(() => {
    return localStorage.getItem('localTune_isShuffled') === 'true';
  });

  const [repeatMode, setRepeatMode] = useState(() => {
    const saved = localStorage.getItem('localTune_repeatMode');
    if (saved) return saved;
    const legacy = localStorage.getItem('localTune_isRepeating');
    return legacy === 'true' ? 'all' : 'off';
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = localStorage.getItem('localTune_currentTime');
    return saved ? parseFloat(saved) : 0;
  });
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => {
    try {
      const saved = localStorage.getItem('localTune_recentlyPlayed');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [listeningHistory, setListeningHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('localTune_listeningHistory');
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [favoritesMap, setFavoritesMap] = useState({});
  const [isNowPlayingOpen, setIsNowPlayingOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  // Settings & Navigation State
  const [selectedArtistForView, setSelectedArtistForView] = useState(null);
  const [ambientBgEnabled, setAmbientBgEnabled] = useState(() => {
    return localStorage.getItem('localTune_ambientBgEnabled') !== 'false';
  });
  const [crossfade, setCrossfade] = useState(() => {
    return parseInt(localStorage.getItem('localTune_crossfade') || '0', 10);
  });
  const [normalizeVolume, setNormalizeVolume] = useState(() => {
    return localStorage.getItem('localTune_normalizeVolume') !== 'false';
  });
  const [autoplay, setAutoplay] = useState(() => {
    return localStorage.getItem('localTune_autoplay') !== 'false';
  });
  const [recommendationMode, setRecommendationMode] = useState(() => {
    return localStorage.getItem('localTune_recMode') || 'Default';
  });
  const [discoveryMode, setDiscoveryMode] = useState(() => {
    return localStorage.getItem('localTune_discoveryMode') === 'true';
  });
  const [audioQuality, setAudioQuality] = useState(() => {
    return localStorage.getItem('localTune_audioQuality') || 'High';
  });
  const [accentMode, setAccentMode] = useState(() => {
    return localStorage.getItem('localTune_accentMode') || 'dynamic';
  });
  const [customAccentColor, setCustomAccentColor] = useState(() => {
    return localStorage.getItem('localTune_customAccentColor') || '#4ea8de';
  });

  const navigateToArtist = (artistData) => {
    if (!artistData) return;
    const artistObj = typeof artistData === 'string' ? { artist: artistData } : artistData;
    setSelectedArtistForView(artistObj);
  };

  const audioRef = useRef(new Audio());
  const initialHydratedRef = useRef(false);

  const { user } = useAuth();

  useEffect(() => {
    fetchFavorites();
  }, [user?.id]);

  const fetchFavorites = async () => {
    try {
      const res = await fetch(apiUrl('/api/favorites'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const map = {};
        (data.favorites || []).forEach((track) => {
          map[track.id] = true;
        });
        setFavoritesMap(map);
      }
    } catch (err) {
      console.error('Error fetching favorites:', err);
    }
  };

  const currentTrackRef = useRef(currentTrack);
  const queueRef = useRef(queue);
  const queueIndexRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const favoritesMapRef = useRef(favoritesMap);

  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { favoritesMapRef.current = favoritesMap; }, [favoritesMap]);

  // Update MediaSession metadata & emit trackChanged event
  useEffect(() => {
    MediaMetadataProvider.updateMediaSessionMetadata(currentTrack);
    LocalTuneEvents.emit('playback.trackChanged', { track: currentTrack });
  }, [currentTrack]);

  // Sync MediaSession position state on time update & play/pause state change
  useEffect(() => {
    MediaMetadataProvider.updateMediaSessionPositionState({
      duration,
      playbackRate: 1,
      position: currentTime,
      isPlaying
    });
  }, [currentTime, duration, isPlaying]);

  // Restore audio source and time on initial mount if stored
  useEffect(() => {
    if (!initialHydratedRef.current && currentTrack) {
      initialHydratedRef.current = true;
      const audio = audioRef.current;
      audio.src = apiUrl(`/stream/${currentTrack.id}`);
      audio.currentTime = currentTime;
    }
  }, [currentTrack]);

  // Dynamic ambient lighting effect on currentTrack change
  useEffect(() => {
    let isCancelled = false;

    if (accentMode === 'blue') {
      applyAmbientColorsToDOM(getDefaultAmbientColors());
      return;
    }

    if (accentMode === 'custom') {
      const c = hexToRgb(customAccentColor);
      if (c) {
        const root = document.documentElement;
        root.style.setProperty('--accent-primary', `rgb(${c.r}, ${c.g}, ${c.b})`);
        root.style.setProperty('--accent-hover', `rgb(${Math.max(0, c.r - 22)}, ${Math.max(0, c.g - 22)}, ${Math.max(0, c.b - 22)})`);
      }
      if (ambientBgEnabled && currentTrack) {
        const artUrl = currentTrack.coverUrl || currentTrack.cover_art_url || apiUrl(`/api/tracks/${currentTrack.id}/art`);
        extractColorsFromAlbumArt(artUrl).then((colors) => {
          if (!isCancelled) {
            const root = document.documentElement;
            root.style.setProperty('--ambient-color-1', colors.c1);
            root.style.setProperty('--ambient-color-2', colors.c2);
            root.style.setProperty('--ambient-color-3', colors.c3);
            root.style.setProperty('--ambient-raw-1', colors.rawPrimary);
            root.style.setProperty('--ambient-raw-2', colors.rawSecondary);
            root.style.setProperty('--ambient-raw-3', colors.rawTertiary);
          }
        });
      }
      return () => { isCancelled = true; };
    }

    // accentMode === 'dynamic'
    if (!ambientBgEnabled) {
      applyAmbientColorsToDOM(getDefaultAmbientColors());
      return;
    }

    if (currentTrack) {
      localStorage.setItem('localTune_currentTrack', JSON.stringify(currentTrack));
      const artUrl = currentTrack.coverUrl || currentTrack.cover_art_url || apiUrl(`/api/tracks/${currentTrack.id}/art`);
      
      extractColorsFromAlbumArt(artUrl).then((colors) => {
        if (!isCancelled && ambientBgEnabled) {
          applyAmbientColorsToDOM(colors);
        }
      });
    } else {
      localStorage.removeItem('localTune_currentTrack');
      applyAmbientColorsToDOM(getDefaultAmbientColors());
    }

    return () => {
      isCancelled = true;
    };
  }, [currentTrack, ambientBgEnabled, accentMode, customAccentColor]);

  useEffect(() => {
    localStorage.setItem('localTune_ambientBgEnabled', ambientBgEnabled ? 'true' : 'false');
  }, [ambientBgEnabled]);

  useEffect(() => {
    localStorage.setItem('localTune_crossfade', crossfade.toString());
  }, [crossfade]);

  useEffect(() => {
    localStorage.setItem('localTune_normalizeVolume', normalizeVolume ? 'true' : 'false');
  }, [normalizeVolume]);

  useEffect(() => {
    localStorage.setItem('localTune_autoplay', autoplay ? 'true' : 'false');
  }, [autoplay]);

  useEffect(() => {
    localStorage.setItem('localTune_recMode', recommendationMode);
  }, [recommendationMode]);

  useEffect(() => {
    localStorage.setItem('localTune_discoveryMode', discoveryMode ? 'true' : 'false');
  }, [discoveryMode]);

  useEffect(() => {
    localStorage.setItem('localTune_audioQuality', audioQuality);
  }, [audioQuality]);

  useEffect(() => {
    localStorage.setItem('localTune_accentMode', accentMode);
  }, [accentMode]);

  useEffect(() => {
    localStorage.setItem('localTune_customAccentColor', customAccentColor);
  }, [customAccentColor]);

  useEffect(() => {
    localStorage.setItem('localTune_queue', JSON.stringify(queue));
  }, [queue]);

  useEffect(() => {
    localStorage.setItem('localTune_isShuffled', isShuffled ? 'true' : 'false');
  }, [isShuffled]);

  const repeatModeRef = useRef(repeatMode);
  useEffect(() => {
    repeatModeRef.current = repeatMode;
    localStorage.setItem('localTune_repeatMode', repeatMode);
    localStorage.setItem('localTune_isRepeating', repeatMode !== 'off' ? 'true' : 'false');
  }, [repeatMode]);

  useEffect(() => {
    localStorage.setItem('localTune_recentlyPlayed', JSON.stringify(recentlyPlayed));
  }, [recentlyPlayed]);

  useEffect(() => {
    localStorage.setItem('localTune_listeningHistory', JSON.stringify(listeningHistory));
  }, [listeningHistory]);

  // Audio element event listeners
  useEffect(() => {
    const audio = audioRef.current;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (Math.floor(audio.currentTime) % 2 === 0) {
        localStorage.setItem('localTune_currentTime', audio.currentTime.toString());
      }
    };

    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => {
      const mode = repeatModeRef.current;
      if (mode === 'one' && currentTrack) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.error(e));
      } else {
        nextTrack();
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => {
      setIsPlaying(false);
      if (audio.currentTime) {
        localStorage.setItem('localTune_currentTime', audio.currentTime.toString());
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [queue, currentTrack, isShuffled, repeatMode]);

  // Web MediaSession API Integration
  useEffect(() => {
    if ('mediaSession' in navigator && currentTrack) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title || 'Unknown Title',
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || 'Octave',
          artwork: currentTrack.cover_art_path ? [
            { src: apiUrl(`/api/tracks/${currentTrack.id}/art`), sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });

      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack());
    }
  }, [currentTrack]);

  const buildFallbackQueue = async (track) => {
    try {
      const res = await apiClient.get('/api/tracks');
      const allTracks = res.tracks || [];
      setQueue((prev) => {
        if (prev.length > 0) return prev;
        if (allTracks.length > 0) {
          const rest = allTracks.filter((t) => t.id !== track.id);
          return [track, ...rest];
        }
        return [track];
      });
    } catch (err) {
      console.error('[Fallback Queue] Failed to fetch library:', err);
      setQueue((prev) => {
        if (prev.length > 0) return prev;
        return [track];
      });
    }
  };

  // Pad the upcoming portion of the queue with additional eligible library
  // tracks so playback doesn't end after just 2-3 songs. Context tracks are
  // always kept first; library/catalog tracks are used only as a FALLBACK to
  // reach the target upcoming count. Never duplicates, never adds the current
  // track as an upcoming entry, never invents tracks, never reshuffles the
  // existing queue. If there are fewer eligible tracks than needed, it uses
  // everything available.
  const ensureQueueHealthy = (baseQueue, currentTrackId) => {
    const currentIdx = baseQueue.findIndex((t) => t.id === currentTrackId);
    const upcomingCount =
      currentIdx === -1 ? baseQueue.length : baseQueue.length - currentIdx - 1;
    const needed = Math.max(0, UPCOMING_TARGET - upcomingCount);
    if (needed === 0) return;

    (async () => {
      try {
        const res = await apiClient.get('/api/tracks');
        const allTracks = res.tracks || [];
        const baseIds = new Set(baseQueue.map((t) => t.id));
        const candidates = allTracks.filter(
          (t) => t && t.id !== currentTrackId && !baseIds.has(t.id)
        );
        if (candidates.length === 0) return;
        const pad = dedupeTracksByID(candidates).slice(0, needed);
        setQueue((prev) => {
          const prevIds = new Set(prev.map((t) => t.id));
          const freshPad = dedupeTracksByID(pad).filter((t) => !prevIds.has(t.id));
          if (freshPad.length === 0) return prev;
          return [...prev, ...freshPad];
        });
      } catch (err) {
        console.error('[Queue Health] Failed to pad upcoming queue:', err);
      }
    })();
  };

  const playTrack = (track, newQueue = null, autoOpenNowPlaying = true) => {
    if (!track) return;
    setCurrentTrack(track);

    if (newQueue && newQueue.length > 0) {
      const deduped = dedupeTracksByID(newQueue);
      setQueue(deduped);
      ensureQueueHealthy(deduped, track.id);
    } else if (queueRef.current.length === 0) {
      buildFallbackQueue(track);
    } else if (queueRef.current.some((t) => t.id === track.id)) {
      // The track is already in an existing queue; just make sure the upcoming
      // portion stays healthy without reshuffling anything.
      ensureQueueHealthy(queueRef.current, track.id);
    }

    if (track.artist) {
      setListeningHistory((prev) => ({
        ...prev,
        [track.artist]: (prev[track.artist] || 0) + 1
      }));
    }

    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((t) => t.id !== track.id);
      return [track, ...filtered].slice(0, 30);
    });

    const audio = audioRef.current;
    audio.src = apiUrl(`/stream/${track.id}`);
    audio.load();
    audio.play().catch((err) => console.error('Audio playback error:', err));

    if (autoOpenNowPlaying) {
      setIsNowPlayingOpen(true);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!currentTrack || !audio) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.error('Playback error:', err);
        setIsPlaying(false);
      });
    }
  };

  const fetchAutoplayTracks = async () => {
    try {
      const curTrackId = currentTrackRef.current ? currentTrackRef.current.id : null;
      const q = queueRef.current;
      const excludeIds = q.map((t) => t.id).join(',');

      const res = await fetch(apiUrl(`/api/tracks/recommendations/autoplay?currentTrackId=${curTrackId || ''}&exclude=${excludeIds}&count=5`), {
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tracks && data.tracks.length > 0) {
          const newQueue = [...q, ...data.tracks];
          setQueue(newQueue);
          playTrack(data.tracks[0], null, false);
          return;
        }
      }
    } catch (err) {
      console.error('[Autoplay Error] Failed fetching autoplay tracks:', err);
    }
    setIsPlaying(false);
  };

  const nextTrack = () => {
    if (!currentTrack || queue.length === 0) return;

    const mode = repeatModeRef.current;
    if (mode === 'one') {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch((err) => console.error('Playback error:', err));
      }
      return;
    }

    if (isShuffled) {
      const randomIndex = Math.floor(Math.random() * queue.length);
      playTrack(queue[randomIndex], null, false);
      return;
    }

    const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex !== -1 && currentIndex < queue.length - 1) {
      playTrack(queue[currentIndex + 1], null, false);
    } else if (queue.length > 0) {
      if (mode === 'all') {
        playTrack(queue[0], null, false);
      } else if (autoplay) {
        fetchAutoplayTracks();
      } else {
        setIsPlaying(false);
      }
    }
  };

  const prevTrack = () => {
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex((t) => t.id === currentTrack.id);
    if (currentIndex > 0) {
      playTrack(queue[currentIndex - 1], null, false);
    } else {
      playTrack(queue[queue.length - 1], null, false);
    }
  };

  const addToQueue = (track) => {
    if (!track) return false;
    if (queueRef.current.some((t) => t.id === track.id)) return false;
    setQueue((prev) => [...prev, track]);
    return true;
  };

  const playNextInQueue = (track) => {
    if (!track) return;
    setQueue((prev) => {
      const currentIndex = prev.findIndex((t) => t.id === currentTrack?.id);
      const filtered = prev.filter((t) => t.id !== track.id);
      if (currentIndex === -1) return [track, ...filtered];
      const next = [...filtered];
      next.splice(currentIndex + 1, 0, track);
      return next;
    });
  };

  const removeFromQueue = (index) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  };

  const clearQueue = () => {
    if (currentTrack) {
      setQueue([currentTrack]);
    } else {
      setQueue([]);
    }
  };

  const toggleShuffle = () => {
    setIsShuffled((prev) => !prev);
  };

  const toggleRepeat = () => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  const seekTrack = (seconds) => {
    const audio = audioRef.current;
    if (audio) {
      audio.currentTime = seconds;
      setCurrentTime(seconds);
      localStorage.setItem('localTune_currentTime', seconds.toString());
    }
  };

  const toggleFavorite = async (trackId) => {
    const isFav = !!favoritesMap[trackId];
    try {
      const method = isFav ? 'DELETE' : 'POST';
      const res = await fetch(apiUrl(`/api/favorites/${trackId}`), {
        method,
        credentials: 'include'
      });
      if (res.ok) {
        setFavoritesMap((prev) => {
          const updated = { ...prev };
          if (isFav) {
            delete updated[trackId];
          } else {
            updated[trackId] = true;
          }
          return updated;
        });
      }
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };
  // Register LocalTuneBridge controller & MediaSession handlers
  useEffect(() => {
    const controller = {
      play: () => {
        if (audioRef.current && currentTrackRef.current) {
          const promise = audioRef.current.play();
          if (promise !== undefined) {
            promise.then(() => {
              setIsPlaying(true);
              LocalTuneEvents.emit('playback.started', { track: currentTrackRef.current });
            }).catch(err => {
              console.warn('[Bridge Play Retry] audio.play() promise rejected, re-loading track stream:', err);
              if (currentTrackRef.current) {
                playTrack(currentTrackRef.current, null, false);
              }
            });
          }
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
      seek: (seconds) => seekTrack(seconds),
      setVolume: (v) => setVolume(v),
      setShuffle: (b) => setIsShuffled(b),
      setRepeat: (m) => setRepeatMode(m),
      getCurrentTrack: () => currentTrackRef.current,
      getIsPlaying: () => isPlayingRef.current,
      getQueue: () => queueRef.current,
      getQueueIndex: () => 0,
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
  }, [nextTrack, prevTrack, seekTrack, toggleFavorite, setVolume]);

  return (
    <PlayerContext.Provider
      value={{
        currentTrack,
        queue,
        isPlaying,
        currentTime,
        duration,
        volume,
        recentlyPlayed,
        listeningHistory,
        favoritesMap,
        fetchFavorites,
        isShuffled,
        repeatMode,
        repeat: repeatMode,
        autoplay,
        setAutoplay,
        selectedArtistForView,
        setSelectedArtistForView,
        navigateToArtist,
        ambientBgEnabled,
        setAmbientBgEnabled,
        crossfade,
        setCrossfade,
        normalizeVolume,
        setNormalizeVolume,
        recommendationMode,
        setRecommendationMode,
        discoveryMode,
        setDiscoveryMode,
        audioQuality,
        setAudioQuality,
        accentMode,
        setAccentMode,
        customAccentColor,
        setCustomAccentColor,
        isRepeating: repeatMode !== 'off',
        isNowPlayingOpen,
        isQueueOpen,
        playTrack,
        togglePlay,
        nextTrack,
        prevTrack,
        addToQueue,
        playNextInQueue,
        removeFromQueue,
        clearQueue,
        toggleShuffle,
        toggleRepeat,
        seekTrack,
        toggleFavorite,
        openNowPlaying: () => {
          try { window.history.pushState({ localTuneModal: 'nowplaying' }, ''); } catch (e) {}
          setIsNowPlayingOpen(true);
        },
        closeNowPlaying: () => setIsNowPlayingOpen(false),
        openQueue: () => {
          try { window.history.pushState({ localTuneModal: 'queue' }, ''); } catch (e) {}
          setIsQueueOpen(true);
        },
        closeQueue: () => setIsQueueOpen(false),
        setVolume
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
