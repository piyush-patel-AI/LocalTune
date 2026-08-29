import { useState, useEffect, useRef, useCallback } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IconSearch, IconMusic, IconPlay, IconFlame, IconClock, IconX } from '../components/Icons';
import { apiUrl } from '../config';
import { fuzzySearch } from '../utils/fuzzySearch';
import { getArtworkUrl } from '../services/MediaMetadataProvider';
import ArtworkImage from '../components/ArtworkImage';
import logo from '../../../Assets/logo.png';

const RECENT_KEY = 'localTune_recentSearches';
const MAX_RECENT = 10;

function loadRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* quota exceeded — silent */ }
}

function addRecentSearch(list, query) {
  const trimmed = query.trim();
  if (!trimmed) return list;
  const norm = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const filtered = list.filter((item) => item.toLowerCase().replace(/\s+/g, ' ') !== norm);
  return [{ raw: trimmed }, ...filtered].slice(0, MAX_RECENT);
}

function removeRecentSearch(list, query) {
  const norm = query.toLowerCase().replace(/\s+/g, ' ');
  return list.filter((item) => item.toLowerCase().replace(/\s+/g, ' ') !== norm);
}

export default function MobileSearchView({ onClose }) {
  const { playTrack, recentlyPlayed } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [trendingArtists, setTrendingArtists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState(loadRecentSearches);
  const allTracksRef = useRef([]);
  const committedRef = useRef(false);

  useEffect(() => {
    fetchAllTracks();
    fetchTrendingArtists();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      committedRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      performSearch(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const fetchAllTracks = async () => {
    try {
      const res = await fetch(apiUrl('/api/tracks'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        allTracksRef.current = data.tracks || [];
      }
    } catch (err) {
      console.error('Error loading tracks for search:', err);
    }
  };

  const fetchTrendingArtists = async () => {
    try {
      const res = await fetch(apiUrl('/api/tracks?groupBy=artist'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTrendingArtists((data.artists || []).slice(0, 6));
      }
    } catch (err) {
      console.error('Error fetching trending artists for search:', err);
    }
  };

  const performSearch = (q) => {
    const tracks = allTracksRef.current;
    if (tracks.length === 0) {
      setResults([]);
      return;
    }
    const matches = fuzzySearch(tracks, q, 30);
    setResults(matches);
  };

  const commitSearch = useCallback((q) => {
    const trimmed = (q || query).trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = addRecentSearch(prev, trimmed);
      saveRecentSearches(next);
      return next;
    });
  }, [query]);

  const handleResultClick = useCallback((track) => {
    commitSearch(query);
    playTrack(track, results);
    onClose();
  }, [commitSearch, query, playTrack, results, onClose]);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && query.trim()) {
      commitSearch(query);
    }
  }, [commitSearch, query]);

  const handleRecentClick = useCallback((raw) => {
    setQuery(raw);
    committedRef.current = true;
    setTimeout(() => commitSearch(raw), 0);
  }, [commitSearch]);

  const handleRecentRemove = useCallback((raw) => {
    setRecentSearches((prev) => {
      const next = removeRecentSearch(prev, raw);
      saveRecentSearches(next);
      return next;
    });
  }, []);

  const recentlyPlayedTracks = (recentlyPlayed || []).filter(
    (t) => t && t.id && t.title
  ).slice(0, 5);

  return (
    <div className="mobile-modal-overlay" style={{ alignItems: 'flex-start' }} onClick={onClose}>
      <div
        className="mobile-modal-sheet animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          height: '100vh',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '1.25rem'
        }}
      >
        {/* Search Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid var(--glass-border-hover)',
              borderRadius: 'var(--radius-pill)',
              padding: '0.6rem 1rem'
            }}
          >
            <IconSearch size={18} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search tracks, artists, or albums..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#ffffff',
                fontSize: '0.92rem',
                fontFamily: 'var(--font-sans)',
                width: '100%'
              }}
            />
            {query && (
              <button
                onClick={() => { setQuery(''); committedRef.current = false; }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                ✕
              </button>
            )}
          </div>
          <button className="sheet-close-btn" onClick={onClose} style={{ fontSize: '0.9rem', fontWeight: 700 }}>
            Cancel
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {query.trim() !== '' ? (
            /* Active Search Results */
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', marginBottom: '0.75rem', display: 'block' }}>
                Search Results ({results.length})
              </span>

              {loading ? (
                <div style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Searching library...</div>
              ) : results.length > 0 ? (
                <div className="quick-picks-list">
                  {results.map((track) => (
                    <div
                      key={track.id}
                      className="quick-pick-row"
                      onClick={() => handleResultClick(track)}
                    >
                      <div className="row-main-info">
                        {track.cover_art_path ? (
                          <img
                            src={apiUrl(`/api/tracks/${track.id}/art`)}
                            alt={track.title}
                            className="row-art"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="row-art-fallback">
                            <IconMusic size={22} color="var(--accent-primary)" />
                          </div>
                        )}
                        <div className="row-text">
                          <span className="row-title">{track.title}</span>
                          <span className="row-artist">{track.artist} • {track.album || 'Single'}</span>
                        </div>
                      </div>

                      <div className="mini-btn">
                        <IconPlay size={18} color="var(--text-primary)" fill="var(--text-primary)" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: '3rem 1rem' }}>
                  <div className="empty-state-icon"><IconMusic size={26} /></div>
                  <p className="empty-state-title">No matching songs found</p>
                  <p className="empty-state-sub">Try searching by track title, artist name, or album.</p>
                </div>
              )}
            </div>
          ) : (
            /* Empty State — Real Data Only */
            <div>
              {/* Recent Searches */}
              {recentSearches.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
                    Recent Searches
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {recentSearches.map((item) => (
                      <button
                        key={item.raw}
                        className="chip-btn"
                        onClick={() => handleRecentClick(item.raw)}
                        style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <IconClock size={12} color="var(--text-muted)" />
                        {item.raw}
                        <span
                          onClick={(e) => { e.stopPropagation(); handleRecentRemove(item.raw); }}
                          style={{ marginLeft: '0.15rem', opacity: 0.5, cursor: 'pointer' }}
                        >
                          <IconX size={11} color="var(--text-muted)" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recentSearches.length === 0 && (
                <div style={{ marginBottom: '1.5rem', textAlign: 'center', padding: '1.5rem 0' }}>
                  <IconSearch size={22} color="var(--text-muted)" style={{ marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
                    Search your music library
                  </p>
                </div>
              )}

              {/* Recently Played — Real Playback History */}
              {recentlyPlayedTracks.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
                    Recently Played
                  </span>
                  <div className="quick-picks-list">
                    {recentlyPlayedTracks.map((track) => (
                      <div
                        key={track.id}
                        className="quick-pick-row"
                        onClick={() => {
                          playTrack(track, recentlyPlayedTracks);
                          onClose();
                        }}
                      >
                        <div className="row-main-info">
                          <ArtworkImage
                            src={getArtworkUrl(track, 256)}
                            alt={track.title}
                            className="row-art"
                            onError={(e) => { e.target.src = logo; }}
                          />
                          <div className="row-text">
                            <span className="row-title">{track.title}</span>
                            <span className="row-artist">{track.artist} • {track.album || 'Single'}</span>
                          </div>
                        </div>
                        <div className="mini-btn">
                          <IconPlay size={18} color="var(--text-primary)" fill="var(--text-primary)" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending Artists */}
              {trendingArtists.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.85rem' }}>
                    <IconFlame size={18} color="var(--accent-primary)" />
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#ffffff' }}>
                      Trending Artists
                    </span>
                  </div>

                  <div className="artist-circle-list">
                    {trendingArtists.map((art, idx) => (
                      <div
                        key={`${art.artist}-${idx}`}
                        className="artist-circle-item"
                        onClick={() => setQuery(art.artist)}
                      >
                        <div className="artist-avatar-ring">
                          {art.artist_image_path ? (
                            <img
                              src={apiUrl(`/api/tracks/artist-image/${encodeURIComponent(art.artist)}`)}
                              alt={art.artist}
                              className="artist-avatar-img"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <div className="artist-avatar-fallback">
                              {art.artist ? art.artist.charAt(0).toUpperCase() : 'A'}
                            </div>
                          )}
                        </div>
                        <span className="artist-circle-name">{art.artist}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
