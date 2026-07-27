import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import {
  IconPlay,
  IconPause,
  IconHeart,
  IconPlus,
  IconMusic,
  IconClock,
  IconSparkles,
  IconDisc,
  IconUser
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
    favoritesMap,
    playTrack,
    togglePlay,
    toggleFavorite
  } = usePlayer();

  const [suggestedTracks, setSuggestedTracks] = useState([]);
  const [allTracks, setAllTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);

  useEffect(() => {
    fetchSuggestedTracks();
  }, [recentlyPlayed.length, favoritesMap]);

  const fetchSuggestedTracks = async () => {
    try {
      const res = await fetch('/api/tracks', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const all = data.tracks || [];
      setAllTracks(all);

      // Collect user listening history context
      const listenedArtists = new Set();
      const listenedAlbums = new Set();

      if (currentTrack) {
        if (currentTrack.artist) listenedArtists.add(currentTrack.artist.toLowerCase());
        if (currentTrack.album) listenedAlbums.add(currentTrack.album.toLowerCase());
      }

      recentlyPlayed.forEach((t) => {
        if (t.artist) listenedArtists.add(t.artist.toLowerCase());
        if (t.album) listenedAlbums.add(t.album.toLowerCase());
      });

      // Incorporate favorited tracks
      all.forEach((t) => {
        if (favoritesMap[t.id]) {
          if (t.artist) listenedArtists.add(t.artist.toLowerCase());
          if (t.album) listenedAlbums.add(t.album.toLowerCase());
        }
      });

      const hasHistory = listenedArtists.size > 0 || listenedAlbums.size > 0;
      const candidates = all.filter((t) => !currentTrack || t.id !== currentTrack.id);

      const scored = candidates.map((track) => {
        let score = 0;
        const trackArtist = (track.artist || '').toLowerCase();
        const trackAlbum = (track.album || '').toLowerCase();

        if (hasHistory) {
          if ([...listenedArtists].some((art) => trackArtist.includes(art) || art.includes(trackArtist))) {
            score += 25;
          }
          if ([...listenedAlbums].some((alb) => trackAlbum.includes(alb) || alb.includes(trackAlbum))) {
            score += 20;
          }
          if (favoritesMap[track.id]) {
            score += 10;
          }
        }

        score += Math.random() * 5;
        return { track, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const topSuggested = scored.map((s) => s.track).slice(0, Math.max(20, Math.min(20, scored.length)));
      setSuggestedTracks(topSuggested.length > 0 ? topSuggested : candidates.slice(0, 20));
    } catch (err) {
      console.error('Error fetching suggested tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShuffleClick = () => {
    const pool = allTracks.length > 0 ? allTracks : suggestedTracks;
    if (pool.length === 0) return;

    // Randomize entire candidate pool
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const newSuggestions = shuffled.slice(0, Math.max(20, Math.min(20, shuffled.length)));
    setSuggestedTracks(newSuggestions);

    // Play the first track from the newly shuffled list
    if (newSuggestions.length > 0) {
      playTrack(newSuggestions[0], newSuggestions);
    }
  };

  const heroTrack = currentTrack || (suggestedTracks.length > 0 ? suggestedTracks[0] : null);

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
              <IconMusic size={32} color="var(--accent-primary)" />
            </div>
          )}

          {track.release_type && track.release_type !== 'album' && (
            <span className={`tile-release-tag tag-${track.release_type}`}>
              {track.release_type.toUpperCase()}
            </span>
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
            <span className="tile-duration">{formatDuration(track.duration_seconds || track.duration)}</span>
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
    <div className="bento-home-container">
      {/* Bento Top Header */}
      <div className="bento-header">
        <h1 className="view-title">Listen Now</h1>
        <p className="view-subtitle">Your personal dashboard & curated recommendations</p>
      </div>

      {/* Bento Top Grid */}
      <div className="bento-grid-top">
        {/* Featured Hero Card */}
        <div className="bento-card bento-hero">
          <div className="bento-hero-art">
            {heroTrack && heroTrack.cover_art_path ? (
              <img
                src={`/api/tracks/${heroTrack.id}/art`}
                alt={heroTrack.title}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="hero-art-fallback">
                <IconDisc size={48} color="var(--accent-primary)" />
              </div>
            )}
          </div>

          <div className="bento-hero-content">
            <span className="bento-pill">
              {isPlaying && currentTrack ? '⚡ NOW PLAYING' : '✨ FEATURED'}
            </span>
            <h2 className="bento-hero-title">{heroTrack ? heroTrack.title : 'Welcome to LocalTune'}</h2>
            <p className="bento-hero-subtitle">{heroTrack ? heroTrack.artist : 'High Fidelity Music Streaming'}</p>
            {heroTrack && (
              <div className="bento-hero-actions">
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (currentTrack && currentTrack.id === heroTrack.id) {
                      togglePlay();
                    } else {
                      playTrack(heroTrack, suggestedTracks);
                    }
                  }}
                >
                  {isPlaying && currentTrack?.id === heroTrack.id ? (
                    <>
                      <IconPause size={16} color="#0f172a" fill="#0f172a" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <IconPlay size={16} color="#0f172a" fill="#0f172a" />
                      <span>Play Now</span>
                    </>
                  )}
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleShuffleClick}
                  title="Shuffle & Play suggested tracks"
                >
                  <IconSparkles size={16} color="var(--accent-primary)" />
                  <span>Shuffle & Play</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats Bento Card */}
        <div className="bento-card bento-stats">
          <div className="bento-stats-header">
            <span className="bento-pill-muted">LIBRARY INSIGHTS</span>
          </div>
          <div className="bento-stats-body">
            <div className="stat-item">
              <div className="stat-value">{allTracks.length}</div>
              <div className="stat-label">
                <IconMusic size={14} color="var(--accent-primary)" />
                Total Tracks
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{suggestedTracks.length}</div>
              <div className="stat-label">
                <IconSparkles size={14} color="var(--accent-cyan)" />
                Suggested Songs
              </div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{Object.keys(favoritesMap).length}</div>
              <div className="stat-label">
                <IconHeart size={14} color="var(--accent-crimson)" fill="var(--accent-crimson)" />
                Favorites
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recently Played Section */}
      <section className="home-section" style={{ marginTop: '0.5rem' }}>
        <div className="bento-section-title">
          <IconClock size={18} color="var(--accent-primary)" />
          <h2>Recently Played</h2>
        </div>

        {recentlyPlayed.length > 0 ? (
          <div className="tiles-grid">
            {recentlyPlayed.map((track) => renderSongTile(track, recentlyPlayed))}
          </div>
        ) : (
          <div className="empty-bento-box">
            <IconMusic size={24} color="var(--text-muted)" />
            <span>No tracks played recently. Jump straight into suggested music below!</span>
          </div>
        )}
      </section>

      {/* Suggested Music Section (20+ Items) */}
      <section className="home-section" style={{ marginTop: '0.75rem' }}>
        <div className="bento-section-title" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <IconSparkles size={18} color="var(--accent-primary)" />
            <h2>Suggested Music ({suggestedTracks.length})</h2>
          </div>
          <button
            className="btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
            onClick={fetchSuggestedTracks}
          >
            Refresh Suggestions
          </button>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Loading recommendations...</div>
        ) : suggestedTracks.length > 0 ? (
          <div className="tiles-grid">
            {suggestedTracks.map((track) => renderSongTile(track, suggestedTracks))}
          </div>
        ) : (
          <div className="empty-bento-box">
            <span>No tracks found in library.</span>
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
