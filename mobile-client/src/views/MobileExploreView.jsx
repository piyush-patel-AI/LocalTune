import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IconFlame, IconMusic, IconPlay, IconHeart, IconMoreVertical, IconSparkles } from '../components/Icons';
import TrackActionSheet from '../components/TrackActionSheet';

const VIBE_CARDS = [
  { name: 'Late Night Vinyl', mode: 'Relax', sub: 'Analog Warmth & Chill', gradient: 'linear-gradient(135deg, rgba(49, 46, 129, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Melancholy Dreams', mode: 'Relax', sub: 'Atmospheric Soundscapes', gradient: 'linear-gradient(135deg, rgba(12, 74, 110, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Deep Focus Work', mode: 'Focus', sub: 'Ambient Instrumental', gradient: 'linear-gradient(135deg, rgba(6, 78, 59, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Pure Energy Boost', mode: 'Energy', sub: 'Upbeat High Fidelity', gradient: 'linear-gradient(135deg, rgba(124, 45, 18, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Workout Heat', mode: 'Workout', sub: 'High Tempo Cardio', gradient: 'linear-gradient(135deg, rgba(190, 18, 60, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Retro Throwback', mode: 'Throwback', sub: 'Classic Library Cuts', gradient: 'linear-gradient(135deg, rgba(109, 40, 217, 0.85), rgba(15, 23, 42, 0.95))' }
];

export default function MobileExploreView() {
  const { playTrack, favoritesMap, toggleFavorite, navigateToArtist } = usePlayer();
  const [allTracks, setAllTracks] = useState([]);
  const [recommendedTracks, setRecommendedTracks] = useState([]);
  const [selectedActionTrack, setSelectedActionTrack] = useState(null);
  const [activeVibe, setActiveVibe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExploreData();
  }, []);

  const fetchExploreData = async () => {
    try {
      setLoading(true);
      const [tracksRes, recsRes] = await Promise.all([
        fetch('/api/tracks', { credentials: 'include' }),
        fetch('/api/tracks/recommendations', { credentials: 'include' })
      ]);

      if (tracksRes.ok) {
        const data = await tracksRes.json();
        setAllTracks(data.tracks || []);
      }

      if (recsRes.ok) {
        const recsData = await recsRes.json();
        setRecommendedTracks(recsData.recommendations || recsData.tracks || []);
      }
    } catch (err) {
      console.error('Error fetching explore data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVibeClick = async (vibe) => {
    setActiveVibe(vibe.name);
    try {
      const res = await fetch(`/api/tracks/recommendations?mode=${vibe.mode}`, { credentials: 'include' });
      let vibeTracks = [];
      if (res.ok) {
        const data = await res.json();
        vibeTracks = data.recommendations || data.tracks || [];
      }
      if (!vibeTracks || vibeTracks.length === 0) {
        vibeTracks = allTracks;
      }
      if (vibeTracks.length > 0) {
        playTrack(vibeTracks[0], vibeTracks);
      }
    } catch (e) {
      console.error('Error triggering vibe mix:', e);
      if (allTracks.length > 0) playTrack(allTracks[0], allTracks);
    }
  };

  const mostRecommended = recommendedTracks.length > 0 ? recommendedTracks.slice(0, 10) : allTracks.slice(0, 10);

  return (
    <div className="mobile-explore animate-fade-in" style={{ padding: '0 0 2.5rem 0' }}>
      {/* Explore Hero Banner */}
      <div className="explore-banner" style={{ margin: '0.75rem 1.25rem 1.5rem 1.25rem' }}>
        <div className="banner-icon-chip">
          <IconSparkles size={16} color="var(--accent-primary)" />
          <span>CURATED MUSIC VIBES</span>
        </div>
        <h1 className="explore-title">Explore Catalog</h1>
        <p className="explore-subtitle">Personalized recommendations and vibe mixes tuned to your listening taste.</p>
      </div>

      {/* Music Vibes Section */}
      <section className="section-container">
        <div className="section-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 className="section-title">Music Vibes</h2>
            {activeVibe && (
              <span style={{ fontSize: '0.72rem', background: 'var(--accent-primary)', color: '#000000', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-pill)', fontWeight: 800 }}>
                ▶ {activeVibe}
              </span>
            )}
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Tap to play</span>
        </div>

        <div className="vibe-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
          {VIBE_CARDS.map((vibe, idx) => {
            const sampleTrack = allTracks[idx % Math.max(1, allTracks.length)];
            const isActive = activeVibe === vibe.name;
            return (
              <div
                key={vibe.name}
                className={`vibe-card ${isActive ? 'active' : ''}`}
                style={{
                  background: vibe.gradient,
                  position: 'relative',
                  overflow: 'hidden',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  cursor: 'pointer',
                  border: isActive ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                  boxShadow: isActive ? '0 0 15px rgba(245, 158, 11, 0.4)' : 'none',
                  transition: 'all 0.25s ease'
                }}
                onClick={() => handleVibeClick(vibe)}
              >
                {sampleTrack && sampleTrack.cover_art_path && (
                  <img
                    src={`/api/tracks/${sampleTrack.id}/art`}
                    alt=""
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      filter: 'blur(16px) saturate(1.2) opacity(0.35)',
                      transform: 'scale(1.2)',
                      pointerEvents: 'none'
                    }}
                  />
                )}
                <div style={{ position: 'relative', zIndex: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="vibe-card-title" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>
                      {vibe.name}
                    </span>
                    <IconFlame size={16} color={isActive ? 'var(--accent-primary)' : 'rgba(255,255,255,0.6)'} />
                  </div>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)', marginTop: '0.3rem' }}>
                    {vibe.sub}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Most Recommended Songs Section */}
      <section className="section-container">
        <div className="section-title-row">
          <div>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Most Recommended For You
            </h2>
          </div>
          <span style={{ fontSize: '0.74rem', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--accent-primary)', padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>
            🔥 Highest Rec Score
          </span>
        </div>

        <div className="horizontal-card-list" style={{ display: 'flex', gap: '0.85rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {mostRecommended.map((track, idx) => {
            const matchScore = track.recommendationScore ? Math.round(track.recommendationScore * 100) : (99 - idx * 2);
            return (
              <div
                key={track.id}
                className="media-card"
                style={{ flexShrink: 0, width: '140px', cursor: 'pointer' }}
                onClick={() => playTrack(track, mostRecommended)}
              >
                <div className="media-card-art-box" style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', aspectRatio: '1/1' }}>
                  {track.cover_art_path ? (
                    <img
                      src={`/api/tracks/${track.id}/art`}
                      alt={track.title}
                      className="media-card-art"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.05)' }}>
                      <IconMusic size={36} color="var(--accent-primary)" />
                    </div>
                  )}

                  {/* Rec Score Badge */}
                  <div style={{
                    position: 'absolute',
                    top: '6px',
                    left: '6px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(6px)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    color: 'var(--accent-primary)',
                    border: '1px solid rgba(245, 158, 11, 0.3)'
                  }}>
                    {matchScore}% Match
                  </div>

                  <div className="media-card-play-hover">
                    <IconPlay size={20} color="#000000" fill="#000000" style={{ marginLeft: '2px' }} />
                  </div>
                </div>

                <div style={{ marginTop: '0.5rem' }}>
                  <span className="media-card-title" style={{ display: 'block', fontWeight: 700, fontSize: '0.85rem', color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {track.title}
                  </span>
                  <span
                    className="media-card-sub"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateToArtist(track.artist);
                    }}
                    style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                  >
                    {track.artist}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Complete Song Catalog List */}
      <section className="section-container">
        <div className="section-title-row">
          <h2 className="section-title">Full Song Catalog</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{allTracks.length} tracks</span>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '1rem 0', textAlign: 'center' }}>Loading catalog...</div>
        ) : (
          <div className="quick-picks-list">
            {allTracks.map((track) => {
              const isFav = !!favoritesMap[track.id];
              return (
                <div
                  key={track.id}
                  className="quick-pick-row"
                  onClick={() => playTrack(track, allTracks)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="row-main-info">
                    {track.cover_art_path ? (
                      <img
                        src={`/api/tracks/${track.id}/art`}
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
                      <span className="row-title" style={{ fontWeight: 700, color: '#ffffff' }}>{track.title}</span>
                      <span
                        className="row-artist"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateToArtist(track.artist);
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        {track.artist} • {track.album || 'Single'}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      className="row-more-btn"
                      onClick={() => toggleFavorite(track.id)}
                      title="Favorite"
                    >
                      <IconHeart
                        size={18}
                        color={isFav ? 'var(--accent-primary)' : 'var(--text-muted)'}
                        fill={isFav ? 'var(--accent-primary)' : 'none'}
                      />
                    </button>

                    <button
                      className="row-more-btn"
                      onClick={() => setSelectedActionTrack(track)}
                      title="More Options"
                    >
                      <IconMoreVertical size={18} color="var(--text-muted)" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Track Action Sheet Modal */}
      {selectedActionTrack && (
        <TrackActionSheet
          track={selectedActionTrack}
          onClose={() => setSelectedActionTrack(null)}
        />
      )}
    </div>
  );
}
