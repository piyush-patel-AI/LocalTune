import { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import { IconSearch, IconPlay, IconPause, IconHeart, IconPlus, IconMusic } from '../components/Icons';

export default function SearchView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);

  const { playTrack, toggleFavorite, favoritesMap, currentTrack, isPlaying } = usePlayer();
  const timerRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!searchTerm.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    // Debounce 250ms
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tracks?search=${encodeURIComponent(searchTerm.trim())}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setResults(data.tracks || []);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [searchTerm]);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Search</h1>
          <p className="view-subtitle">Search tracks by title, artist, or album</p>
        </div>
      </div>

      <div className="search-container" style={{ marginBottom: '2rem' }}>
        <span className="search-icon">
          <IconSearch size={18} color="var(--text-muted)" />
        </span>
        <input
          type="text"
          className="search-input"
          placeholder="Type title, artist, or album..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          autoFocus
        />
      </div>

      {isSearching ? (
        <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Searching catalog...</div>
      ) : !searchTerm.trim() ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>
          Start typing in the search box above to find songs, artists, or albums.
        </div>
      ) : results.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '3rem' }}>
          No matching tracks found for "{searchTerm}".
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
            Found {results.length} matching track{results.length !== 1 ? 's' : ''}
          </p>

          <table className="track-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>#</th>
                <th>Title</th>
                <th>Artist</th>
                <th>Album</th>
                <th style={{ width: '100px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((track) => {
                const isCurrent = currentTrack && currentTrack.id === track.id;
                const isFav = !!favoritesMap[track.id];
                return (
                  <tr key={track.id} className={`track-row ${isCurrent ? 'active' : ''}`} onDoubleClick={() => playTrack(track, results)}>
                    <td>
                      {isCurrent && isPlaying ? (
                        <div className="vu-equalizer" style={{ marginLeft: '6px' }}>
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        <button className="play-row-btn" onClick={() => playTrack(track, results)}>
                          {isCurrent ? <IconPause size={14} /> : <IconPlay size={14} />}
                        </button>
                      )}
                    </td>
                    <td>
                      <div className="track-title-cell">
                        {track.cover_art_path ? (
                          <img
                            src={`/api/tracks/${track.id}/art`}
                            alt={track.title}
                            className="track-art-placeholder"
                            style={{ objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="track-art-placeholder">
                            <IconMusic size={18} color="var(--text-secondary)" />
                          </div>
                        )}
                        <div>
                          <div className="track-name-bold">{track.title}</div>
                          {track.format && (
                            <span className="format-badge" style={{ marginTop: '0.2rem' }}>{track.format.toUpperCase()}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{track.artist}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{track.album}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          className={`fav-toggle-btn ${isFav ? 'is-fav' : ''}`}
                          onClick={() => toggleFavorite(track.id)}
                          title={isFav ? 'Remove Favorite' : 'Favorite'}
                        >
                          <IconHeart
                            size={18}
                            color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
                            fill={isFav ? 'var(--accent-crimson)' : 'none'}
                          />
                        </button>
                        <button
                          className="control-btn"
                          style={{ fontSize: '1rem' }}
                          onClick={() => setSelectedTrackForPlaylist(track)}
                          title="Add to Playlist"
                        >
                          <IconPlus size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTrackForPlaylist && (
        <AddToPlaylistModal
          track={selectedTrackForPlaylist}
          onClose={() => setSelectedTrackForPlaylist(null)}
        />
      )}
    </div>
  );
}
