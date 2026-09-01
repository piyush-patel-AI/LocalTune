import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { logRecommendationAction } from '../services/recommendationTelemetry';
import {
  IconPlay,
  IconPause,
  IconHeart,
  IconPlus,
  IconMusic,
  IconClock,
  IconSparkles,
  IconDisc
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
  }, [currentTrack?.id, recentlyPlayed.length, favoritesMap]);

  const fetchSuggestedTracks = async () => {
    try {
      setLoading(true);
      const resAll = await fetch('/api/tracks', { credentials: 'include' });
      if (resAll.ok) {
        const dataAll = await resAll.json();
        setAllTracks(dataAll.tracks || []);
      }

      const recUrl = `/api/tracks/recommendations${currentTrack ? `?currentTrackId=${currentTrack.id}` : ''}`;
      const resRec = await fetch(recUrl, { credentials: 'include' });
      if (resRec.ok) {
        const dataRec = await resRec.json();
        setSuggestedTracks(dataRec.tracks || []);
      }
    } catch (err) {
      console.error('Error fetching smart recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShuffleClick = () => {
    const pool = allTracks.length > 0 ? allTracks : suggestedTracks;
    if (pool.length === 0) return;

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const newSuggestions = shuffled.slice(0, Math.max(20, Math.min(20, shuffled.length)));
    setSuggestedTracks(newSuggestions);

    if (newSuggestions.length > 0) {
      playTrack(newSuggestions[0], newSuggestions);
    }
  };

  const heroTrack = currentTrack || (suggestedTracks.length > 0 ? suggestedTracks[0] : null);
  const quickPicks = (allTracks.length > 0 ? allTracks : suggestedTracks).slice(0, 6);

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
          <div className="tile-album" title={track.album}>{track.album || 'Single'}</div>
        </div>

        <div className="tile-card-divider" />

        <div className="tile-actions-footer" onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              className={`tile-action-btn ${isFav ? 'is-fav' : ''}`}
              onClick={() => toggleFavorite(track.id)}
              title={isFav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <IconHeart
                size={15}
                color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
                fill={isFav ? 'var(--accent-crimson)' : 'none'}
              />
            </button>
            <button
              className="tile-action-btn"
              onClick={() => setSelectedTrackForPlaylist(track)}
              title="Add to Playlist"
            >
              <IconPlus size={15} color="var(--text-muted)" />
            </button>
          </div>

          <span className="tile-duration-text">
            {formatDuration(track.duration_seconds || track.duration)}
          </span>
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

      {/* MOBILE ONLY: Quick Picks 6-Pill Grid */}
      {quickPicks.length > 0 && (
        <div className="mobile-only-quickpicks">
          <div className="quick-picks-container">
            {quickPicks.map((track) => {
              const isCurrent = currentTrack && currentTrack.id === track.id;
              return (
                <div
                  key={track.id}
                  className={`quick-pick-pill ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                  logRecommendationAction(track.id, 'played', {
                    shelfId: 'quickPicks', surface: 'quickPicks', source: 'home'
                  });
                  playTrack(track, quickPicks);
                }}
                >
                  {track.cover_art_path ? (
                    <img src={`/api/tracks/${track.id}/art`} alt={track.title} className="quick-pick-art" />
                  ) : (
                    <div className="quick-pick-art fallback">
                      <IconMusic size={18} color="var(--accent-primary)" />
                    </div>
                  )}
                  <span className="quick-pick-title">{track.title}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DESKTOP ONLY: Bento Top Grid (Hero + Insights) */}
      <div className="bento-grid-top">
        <div className="bento-card bento-hero">
          {heroTrack && heroTrack.cover_art_path && (
            <div
              className="bento-hero-bg-blur"
              style={{ backgroundImage: `url(/api/tracks/${heroTrack.id}/art)` }}
            />
          )}

          <div className="bento-hero-art">
            {heroTrack && heroTrack.cover_art_path ? (
              <img
                src={`/api/tracks/${heroTrack.id}/art`}
                alt={heroTrack.title}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="hero-art-fallback">
                <IconDisc size={56} color="var(--accent-primary)" />
              </div>
            )}
          </div>

          <div className="bento-hero-content">
            <span className="bento-pill">
              {isPlaying && currentTrack ? '⚡ NOW PLAYING' : '✨ RECOMMENDED TODAY'}
            </span>
            <h2 className="bento-hero-title">{heroTrack ? heroTrack.title : 'Welcome to Octave'}</h2>
            <p className="bento-hero-subtitle">{heroTrack ? `${heroTrack.artist} • ${heroTrack.album || 'Single'}` : 'High Fidelity Music Streaming'}</p>
            {heroTrack && (
              <div className="bento-hero-actions">
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (currentTrack && currentTrack.id === heroTrack.id) {
                      togglePlay();
                    } else {
                      logRecommendationAction(heroTrack.id, 'played', {
                        shelfId: 'hero', surface: 'hero', source: 'home'
                      });
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

        {/* Library Insights Widget */}
        <div className="bento-card bento-stats-widget">
          <div className="widget-header">
            <span className="widget-pill-muted">LIBRARY INSIGHTS</span>
          </div>

          <div className="widget-pills-container">
            <div className="widget-pill-row">
              <div className="widget-icon-badge icon-amber">
                <IconMusic size={14} color="var(--accent-primary)" />
              </div>
              <div className="widget-pill-info">
                <span className="widget-pill-val">{allTracks.length}</span>
                <span className="widget-pill-lbl">Library Songs</span>
              </div>
            </div>

            <div className="widget-pill-row">
              <div className="widget-icon-badge icon-cyan">
                <IconSparkles size={14} color="var(--accent-cyan)" />
              </div>
              <div className="widget-pill-info">
                <span className="widget-pill-val">{suggestedTracks.length}</span>
                <span className="widget-pill-lbl">Recommended Today</span>
              </div>
            </div>

            <div className="widget-pill-row">
              <div className="widget-icon-badge icon-crimson">
                <IconHeart size={14} color="var(--accent-crimson)" fill="var(--accent-crimson)" />
              </div>
              <div className="widget-pill-info">
                <span className="widget-pill-val">{Object.keys(favoritesMap).length}</span>
                <span className="widget-pill-lbl">Favorites</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Suggested Music Section (FIRST) */}
      <section className="home-section" style={{ marginTop: '1.5rem' }}>
        <div className="bento-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="bento-section-title">
            <IconSparkles size={18} color="var(--accent-primary)" />
            <h2>Suggested Music ({suggestedTracks.length})</h2>
          </div>
          <button
            className="btn-secondary"
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
            onClick={fetchSuggestedTracks}
          >
            Refresh
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

      {/* Recently Played Section (SECOND) */}
      <section className="home-section" style={{ marginTop: '1.75rem' }}>
        <div className="bento-section-header">
          <div className="bento-section-title">
            <IconClock size={18} color="var(--accent-primary)" />
            <h2>Recently Played</h2>
          </div>
          <p className="bento-section-subtitle">Continue where you left off</p>
        </div>

        {recentlyPlayed.length > 0 ? (
          <div className="tiles-grid">
            {recentlyPlayed.map((track) => renderSongTile(track, recentlyPlayed))}
          </div>
        ) : (
          <div className="empty-bento-box">
            <IconMusic size={24} color="var(--text-muted)" />
            <span>No tracks played recently. Jump straight into suggested music above!</span>
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
