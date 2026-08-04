import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IconFlame, IconMusic, IconPlay, IconHeart, IconMoreVertical, IconSparkles } from '../components/Icons';
import TrackActionSheet from '../components/TrackActionSheet';

const VIBE_CARDS = [
  { name: 'Late Night Vinyl', sub: 'Analog Warmth & Chill', gradient: 'linear-gradient(135deg, rgba(49, 46, 129, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Melancholy Dreams', sub: 'Atmospheric Soundscapes', gradient: 'linear-gradient(135deg, rgba(12, 74, 110, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Deep Focus Work', sub: 'Ambient Electronic', gradient: 'linear-gradient(135deg, rgba(6, 78, 59, 0.85), rgba(15, 23, 42, 0.95))' },
  { name: 'Pure Energy Boost', sub: 'Upbeat High Fidelity', gradient: 'linear-gradient(135deg, rgba(124, 45, 18, 0.85), rgba(15, 23, 42, 0.95))' }
];

export default function MobileExploreView() {
  const { playTrack, favoritesMap, toggleFavorite } = usePlayer();
  const [allTracks, setAllTracks] = useState([]);
  const [selectedHits, setSelectedHits] = useState([]);
  const [selectedActionTrack, setSelectedActionTrack] = useState(null);
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
        setSelectedHits(recsData.recommendations || []);
      }
    } catch (err) {
      console.error('Error fetching explore data:', err);
    } finally {
      setLoading(false);
    }
  };

  const featuredList = selectedHits.length > 0 ? selectedHits.slice(0, 8) : allTracks.slice(0, 8);

  return (
    <div className="mobile-explore animate-fade-in" style={{ padding: '0 0 2rem 0' }}>
      {/* Explore Hero Banner */}
      <div className="explore-banner" style={{ margin: '0.75rem 1.25rem 1.5rem 1.25rem' }}>
        <div className="banner-icon-chip">
          <IconSparkles size={16} color="var(--accent-primary)" />
          <span>CURATED MUSIC VIBES</span>
        </div>
        <h1 className="explore-title">Explore Catalog</h1>
        <p className="explore-subtitle">Discover curated vibe mixes sampled directly from your high-fidelity music library.</p>
      </div>

      {/* Vibe & Mood Cards (Sampled Album Art Texture & Dark Glass Gradients) */}
      <section className="section-container">
        <div className="section-title-row">
          <h2 className="section-title">Music Vibes</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sampled</span>
        </div>

        <div className="vibe-grid">
          {VIBE_CARDS.map((vibe, idx) => {
            const sampleTrack = allTracks[idx % Math.max(1, allTracks.length)];
            return (
              <div
                key={vibe.name}
                className="vibe-card"
                style={{ background: vibe.gradient, position: 'relative', overflow: 'hidden' }}
                onClick={() => {
                  const keyword = vibe.name.split(' ')[0].toLowerCase();
                  const filtered = allTracks.filter((t) =>
                    (t.genre && t.genre.toLowerCase().includes(keyword)) ||
                    (t.title && t.title.toLowerCase().includes(keyword))
                  );
                  if (filtered.length > 0) playTrack(filtered[0], filtered);
                  else if (allTracks.length > 0) playTrack(allTracks[0], allTracks);
                }}
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
                  <span className="vibe-card-title">{vibe.name}</span>
                  <span style={{ display: 'block', fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginTop: '0.2rem' }}>{vibe.sub}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Selected Hits & Recommended Carousel */}
      <section className="section-container">
        <div className="section-title-row">
          <h2 className="section-title">Selected Hits</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Top Picks</span>
        </div>

        <div className="horizontal-card-list">
          {featuredList.map((track) => (
            <div
              key={track.id}
              className="media-card"
              onClick={() => playTrack(track, featuredList)}
            >
              <div className="media-card-art-box">
                {track.cover_art_path ? (
                  <img
                    src={`/api/tracks/${track.id}/art`}
                    alt={track.title}
                    className="media-card-art"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.05)' }}>
                    <IconMusic size={36} color="var(--accent-primary)" />
                  </div>
                )}
                <div className="media-card-play-hover">
                  <IconPlay size={20} color="#000000" fill="#000000" style={{ marginLeft: '2px' }} />
                </div>
              </div>
              <span className="media-card-title">{track.title}</span>
              <span className="media-card-sub">{track.artist}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Complete Song Catalog List */}
      <section className="section-container">
        <div className="section-title-row">
          <h2 className="section-title">Full Song Catalog</h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{allTracks.length} tracks</span>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Loading catalog...</div>
        ) : (
          <div className="quick-picks-list">
            {allTracks.map((track) => {
              const isFav = !!favoritesMap[track.id];
              return (
                <div
                  key={track.id}
                  className="quick-pick-row"
                  onClick={() => playTrack(track, allTracks)}
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
                      <span className="row-title">{track.title}</span>
                      <span className="row-artist">{track.artist} • {track.album || 'Single'}</span>
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
