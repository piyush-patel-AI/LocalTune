import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IconHeart, IconPlay, IconPause, IconMusic } from '../components/Icons';

export default function FavoritesView() {
  const [favTracks, setFavTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { playTrack, toggleFavorite, favoritesMap, currentTrack, isPlaying } = usePlayer();

  const fetchFavorites = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/favorites', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setFavTracks(data.favorites || []);
      }
    } catch (err) {
      console.error('Fetch favorites error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, [favoritesMap]);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span>Favorites</span>
            <IconHeart size={24} color="var(--accent-crimson)" fill="var(--accent-crimson)" />
          </h1>
          <p className="view-subtitle">{favTracks.length} tracks saved in your favorites</p>
        </div>
        {favTracks.length > 0 && (
          <button className="btn-primary" onClick={() => playTrack(favTracks[0], favTracks)}>
            <IconPlay size={16} color="#0f172a" fill="#0f172a" />
            <span>Play Favorites</span>
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Loading favorites...</div>
      ) : favTracks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          You haven't added any favorite tracks yet. Click the heart icon on any track to save it here!
        </div>
      ) : (
        <table className="track-table">
          <thead>
            <tr>
              <th style={{ width: '45px' }}>#</th>
              <th>Title</th>
              <th>Artist</th>
              <th>Album</th>
              <th style={{ width: '60px' }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {favTracks.map((track) => {
              const isCurrent = currentTrack && currentTrack.id === track.id;
              return (
                <tr key={track.id} className={`track-row ${isCurrent ? 'active' : ''}`} onDoubleClick={() => playTrack(track, favTracks)}>
                  <td>
                    {isCurrent && isPlaying ? (
                      <div className="vu-equalizer" style={{ marginLeft: '6px' }}>
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : (
                      <button className="play-row-btn" onClick={() => playTrack(track, favTracks)}>
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
                      <div className="track-name-bold">{track.title}</div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{track.artist}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{track.album}</td>
                  <td>
                    <button
                      className="fav-toggle-btn is-fav"
                      onClick={() => toggleFavorite(track.id)}
                      title="Remove from favorites"
                    >
                      <IconHeart size={18} color="var(--accent-crimson)" fill="var(--accent-crimson)" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
