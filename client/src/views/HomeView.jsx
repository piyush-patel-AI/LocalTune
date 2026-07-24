import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import {
  IconPlay,
  IconPause,
  IconHeart,
  IconPlus,
  IconMusic,
  IconClock,
  IconSparkles
} from '../components/Icons';
import AddToPlaylistModal from '../components/AddToPlaylistModal';

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function HomeView() {
  const {
    currentTrack,
    isPlaying,
    recentlyPlayed,
    clearRecentlyPlayed,
    favoritesMap,
    playTrack,
    togglePlay,
    toggleFavorite,
    addToQueue
  } = usePlayer();

  const [suggestedTracks, setSuggestedTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);

  useEffect(() => {
    fetchSuggestedTracks();
  }, []);

  const fetchSuggestedTracks = async () => {
    try {
      const res = await fetch('/api/tracks', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const all = data.tracks || [];
        // Shuffle tracks for discovery
        const shuffled = [...all].sort(() => 0.5 - Math.random()).slice(0, 12);
        setSuggestedTracks(shuffled);
      }
    } catch (err) {
      console.error('Error fetching suggested tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  const renderSongTile = (track, trackList) => {
    const isCurrent = currentTrack && currentTrack.id === track.id;
    const isFav = !!favoritesMap[track.id];

    return (
      <div
        key={track.id}
        className={`song-tile ${isCurrent ? 'active' : ''}`}
        onClick={() => {
          if (isCurrent) {
            togglePlay();
          } else {
            playTrack(track, trackList);
          }
        }}
      >
        <div className="tile-art-wrapper">
          {track.cover_art_path ? (
            <img
              src={`/api/tracks/${track.id}/art`}
              alt={track.title}
              className="tile-art-img"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="tile-art-fallback">
              <IconMusic size={36} color="var(--accent-primary)" />
            </div>
          )}

          {track.format && (
            <span className="tile-format-badge">{track.format.toUpperCase()}</span>
          )}

          <div className="tile-hover-overlay">
            <button
              className="tile-play-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (isCurrent) {
                  togglePlay();
                } else {
                  playTrack(track, trackList);
                }
              }}
              title={isCurrent && isPlaying ? 'Pause' : 'Play'}
            >
              {isCurrent && isPlaying ? (
                <IconPause size={18} color="#111" fill="#111" />
              ) : (
                <IconPlay size={18} color="#111" fill="#111" style={{ marginLeft: '2px' }} />
              )}
            </button>
          </div>
        </div>

        <div className="tile-info">
          <div className="tile-title" title={track.title}>{track.title}</div>
          <div className="tile-artist" title={track.artist}>{track.artist}</div>
          <div className="tile-meta">
            <span className="tile-album">{track.album || 'Single'}</span>
            <span className="tile-duration">{formatDuration(track.duration)}</span>
          </div>
        </div>

        <div className="tile-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className={`tile-action-btn ${isFav ? 'is-fav' : ''}`}
            onClick={() => toggleFavorite(track.id)}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <IconHeart
              size={16}
              color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
              fill={isFav ? 'var(--accent-crimson)' : 'none'}
            />
          </button>
          <button
            className="tile-action-btn"
            onClick={() => setSelectedTrackForPlaylist(track)}
            title="Add to Playlist"
          >
            <IconPlus size={16} color="var(--text-muted)" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="home-view">
      <div className="view-header">
        <div>
          <h1 className="view-title">Listen Now</h1>
          <p className="view-subtitle" style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.95rem' }}>
            Your personal workstation overview, recently played history, and curated recommendations.
          </p>
        </div>
      </div>

      {/* Recently Played Section */}
      <section className="home-section">
        <div className="section-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconClock size={20} color="var(--accent-primary)" />
            <h2 className="section-heading">Recently Played</h2>
          </div>
        </div>

        {recentlyPlayed.length > 0 ? (
          <div className="tiles-grid">
            {recentlyPlayed.map((track) => renderSongTile(track, recentlyPlayed))}
          </div>
        ) : (
          <div className="empty-state-card" style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px border-dashed var(--border-color)' }}>
            <IconMusic size={32} color="var(--text-muted)" style={{ marginBottom: '0.5rem' }} />
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              No tracks played recently. Start listening from your suggested music below!
            </div>
          </div>
        )}
      </section>

      {/* Suggested Music Section */}
      <section className="home-section" style={{ marginTop: '2.5rem' }}>
        <div className="section-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconSparkles size={20} color="var(--accent-primary)" />
            <h2 className="section-heading">Suggested Music</h2>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '2rem 0' }}>Loading recommendations...</div>
        ) : suggestedTracks.length > 0 ? (
          <div className="tiles-grid">
            {suggestedTracks.map((track) => renderSongTile(track, suggestedTracks))}
          </div>
        ) : (
          <div className="empty-state-card" style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ color: 'var(--text-secondary)' }}>No tracks in library yet.</div>
          </div>
        )}
      </section>

      {selectedTrackForPlaylist && (
        <AddToPlaylistModal
          track={selectedTrackForPlaylist}
          onClose={() => setSelectedTrackForPlaylist(null)}
        />
      )}
    </div>
  );
}
