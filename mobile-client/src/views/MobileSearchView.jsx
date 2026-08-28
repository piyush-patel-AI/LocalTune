import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IconSearch, IconMusic, IconPlay, IconUser, IconFlame } from '../components/Icons';
import { apiUrl } from '../config';

const RECENT_SEARCHES = ['Coldplay', 'Electronic Synth', 'Post Malone', 'Chill Beats', 'Instrumental'];
const QUICK_MOODS = ['Acoustic Vibes', 'Focus & Deep Study', 'Late Night Vinyl', 'High Energy Workout'];

export default function MobileSearchView({ onClose }) {
  const { playTrack } = usePlayer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [trendingArtists, setTrendingArtists] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTrendingArtists();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      performSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

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

  const performSearch = async (q) => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl(`/api/tracks?search=${encodeURIComponent(q)}`), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setResults(data.tracks || []);
      }
    } catch (err) {
      console.error('Search query error:', err);
    } finally {
      setLoading(false);
    }
  };

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
                onClick={() => setQuery('')}
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
                      onClick={() => {
                        playTrack(track, results);
                        onClose();
                      }}
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
            /* Empty State / Discovery Suggestions */
            <div>
              {/* Recent Searches Tag Pills */}
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
                  Recent Searches
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {RECENT_SEARCHES.map((tag) => (
                    <button
                      key={tag}
                      className="chip-btn"
                      onClick={() => setQuery(tag)}
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick Mood Categories */}
              <div style={{ marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', marginBottom: '0.65rem', display: 'block' }}>
                  Quick Categories
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {QUICK_MOODS.map((mood) => (
                    <button
                      key={mood}
                      className="chip-btn active"
                      onClick={() => setQuery(mood.split(' ')[0])}
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                    >
                      {mood}
                    </button>
                  ))}
                </div>
              </div>

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
