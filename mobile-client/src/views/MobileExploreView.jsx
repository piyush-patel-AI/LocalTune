import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import {
  IconFlame,
  IconMusic,
  IconPlay,
  IconHeart,
  IconMoreVertical,
  IconSparkles,
  IconSearch
} from '../components/Icons';
import TrackActionSheet from '../components/TrackActionSheet';
import { apiUrl } from '../config';

const MOOD_CARDS = [
  {
    id: 'pop',
    name: 'Pop & Dance',
    desc: 'Energetic beats & catchy hooks',
    keywords: ['pop', 'dance', 'electro pop', 'synthpop', 'chart', 'disco'],
    gradient: 'linear-gradient(135deg, rgba(236, 72, 153, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '🎤'
  },
  {
    id: 'hiphop',
    name: 'Hip-Hop & Rap',
    desc: 'Heavy basslines & sharp flows',
    keywords: ['hip hop', 'hip-hop', 'rap', 'trap', 'drill', 'urban', 'boom bap'],
    gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '🔥'
  },
  {
    id: 'rock',
    name: 'Rock & Alt',
    desc: 'Guitar riffs & raw energy',
    keywords: ['rock', 'alternative', 'alt', 'indie rock', 'punk', 'metal', 'hard rock'],
    gradient: 'linear-gradient(135deg, rgba(220, 38, 38, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '🎸'
  },
  {
    id: 'chill',
    name: 'Chill & Acoustic',
    desc: 'Unwind with soft acoustic cuts',
    keywords: ['chill', 'acoustic', 'ambient', 'lo-fi', 'lofi', 'folk', 'lounge', 'relax'],
    gradient: 'linear-gradient(135deg, rgba(14, 165, 233, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '🌙'
  },
  {
    id: 'electronic',
    name: 'Electronic & EDM',
    desc: 'Synthesizers & driving rhythms',
    keywords: ['electronic', 'edm', 'house', 'techno', 'trance', 'electro', 'dubstep', 'dance'],
    gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '⚡'
  },
  {
    id: 'rnb',
    name: 'R&B & Soul',
    desc: 'Smooth vocals & groovy rhythms',
    keywords: ['r&b', 'rnb', 'soul', 'funk', 'neo soul', 'gospel'],
    gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '🎷'
  },
  {
    id: 'focus',
    name: 'Focus & Classical',
    desc: 'Deep concentration soundscapes',
    keywords: ['focus', 'classical', 'piano', 'instrumental', 'study', 'soundtrack', 'score'],
    gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '🎧'
  },
  {
    id: 'indie',
    name: 'Indie & Folk',
    desc: 'Atmospheric & bedroom pop',
    keywords: ['indie', 'folk', 'singer-songwriter', 'alternative indie', 'bedroom pop'],
    gradient: 'linear-gradient(135deg, rgba(20, 184, 166, 0.9), rgba(15, 23, 42, 0.95))',
    icon: '🌱'
  }
];

const SPOTLIGHT_ITEMS = [
  {
    id: 'spotlight-1',
    badge: 'Trending Now',
    title: 'Top Recommendation Mix',
    sub: 'Handpicked tracks based on your recent listening',
    gradient: 'linear-gradient(135deg, #8b5cf6, #ec4899)'
  },
  {
    id: 'spotlight-2',
    badge: 'Editorial Pick',
    title: 'High Voltage Anthems',
    sub: 'Electrifying beats & iconic soundscapes',
    gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)'
  },
  {
    id: 'spotlight-3',
    badge: 'Mood Station',
    title: 'Deep Midnight Focus',
    sub: 'Instrumental waves for intense productivity',
    gradient: 'linear-gradient(135deg, #06b6d4, #3b82f6)'
  }
];

export default function MobileExploreView() {
  const { playTrack, favoritesMap, toggleFavorite, navigateToArtist } = usePlayer();
  const [allTracks, setAllTracks] = useState([]);
  const [recommendedTracks, setRecommendedTracks] = useState([]);
  const [selectedActionTrack, setSelectedActionTrack] = useState(null);
  const [activeMood, setActiveMood] = useState(null);
  const [activeMoodCount, setActiveMoodCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all'); // all | spotlight | moods | recommended | catalog
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExploreData();
  }, []);

  const fetchExploreData = async () => {
    try {
      setLoading(true);
      const [tracksRes, recsRes] = await Promise.all([
        fetch(apiUrl('/api/tracks'), { credentials: 'include' }),
        fetch(apiUrl('/api/tracks/recommendations'), { credentials: 'include' })
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

  const handleMoodClick = (mood) => {
    setActiveMood(mood.name);

    // Filter tracks strictly based on genre & keywords
    const keywords = mood.keywords;
    let moodTracks = allTracks.filter((t) => {
      const g = (t.genre || '').toLowerCase();
      const title = (t.title || '').toLowerCase();
      const album = (t.album || '').toLowerCase();
      return keywords.some((kw) => g.includes(kw) || title.includes(kw) || album.includes(kw));
    });

    // Fallback if metadata has no explicit genre match: partition tracks deterministically by mood slot
    if (!moodTracks || moodTracks.length === 0) {
      const moodIndex = MOOD_CARDS.findIndex((m) => m.id === mood.id);
      moodTracks = allTracks.filter((_, idx) => (idx % MOOD_CARDS.length) === moodIndex);
    }
    if (!moodTracks || moodTracks.length === 0) {
      moodTracks = allTracks;
    }

    setActiveMoodCount(moodTracks.length);

    // Immediately start playback of genre track & build queue
    if (moodTracks.length > 0) {
      playTrack(moodTracks[0], moodTracks);
    }
  };

  const mostRecommended = recommendedTracks.length > 0 ? recommendedTracks.slice(0, 10) : allTracks.slice(0, 10);

  // Filtered tracks based on live search query
  const filteredCatalog = searchQuery.trim()
    ? allTracks.filter((t) =>
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.album && t.album.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : allTracks;

  return (
    <div className="mobile-explore animate-fade-in" style={{ padding: '0 0 2.5rem 0' }}>
      {/* Search Anchor Bar */}
      <div className="explore-search-bar">
        <IconSearch size={18} color="var(--text-muted)" />
        <input
          type="text"
          className="explore-search-input"
          placeholder="What do you want to listen to?"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Quick Filter Chips */}
      <div className="quick-filter-bar">
        <button
          className={`quick-filter-chip ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          ✨ All
        </button>
        <button
          className={`quick-filter-chip ${activeFilter === 'spotlight' ? 'active' : ''}`}
          onClick={() => setActiveFilter('spotlight')}
        >
          🌟 Featured Spotlight
        </button>
        <button
          className={`quick-filter-chip ${activeFilter === 'moods' ? 'active' : ''}`}
          onClick={() => setActiveFilter('moods')}
        >
          🔥 Moods & Genres
        </button>
        <button
          className={`quick-filter-chip ${activeFilter === 'recommended' ? 'active' : ''}`}
          onClick={() => setActiveFilter('recommended')}
        >
          💎 Recommended
        </button>
        <button
          className={`quick-filter-chip ${activeFilter === 'catalog' ? 'active' : ''}`}
          onClick={() => setActiveFilter('catalog')}
        >
          🎵 Song Catalog
        </button>
      </div>

      {/* Hero Header Banner */}
      {!searchQuery && (
        <div className="explore-banner" style={{ margin: '0.75rem 1.25rem 1.5rem 1.25rem' }}>
          <div className="banner-icon-chip">
            <IconSparkles size={16} color="var(--accent-primary)" />
            <span>MUSIC DISCOVERY HUB</span>
          </div>
          <h1 className="explore-title">Explore Catalog</h1>
          <p className="explore-subtitle">Discover personalized recommendations, genre radios, and curated music mixes.</p>
        </div>
      )}

      {/* Featured Spotlight Hero Carousel */}
      {!searchQuery && (activeFilter === 'all' || activeFilter === 'spotlight') && (
        <section className="section-container">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconSparkles size={15} color="var(--text-muted)" />
              Featured Spotlight
            </h2>
            <span className="section-helper">Swipe to discover</span>
          </div>

          <div className="spotlight-carousel">
            {SPOTLIGHT_ITEMS.map((spot, idx) => {
              const sampleTrack = allTracks[idx % Math.max(1, allTracks.length)];
              return (
                <div
                  key={spot.id}
                  className="spotlight-card"
                  style={{ background: spot.gradient }}
                  onClick={() => {
                    if (mostRecommended.length > 0) {
                      playTrack(mostRecommended[idx % mostRecommended.length], mostRecommended);
                    }
                  }}
                >
                  <div className="spotlight-badge">
                    <IconSparkles size={12} color="var(--accent-primary)" />
                    {spot.badge}
                  </div>
                  <div>
                    <h3 className="spotlight-title">{spot.title}</h3>
                    <p className="spotlight-sub">{spot.sub}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.4rem', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#ffffff', opacity: 0.9, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 44px)' }}>
                      {sampleTrack ? `${sampleTrack.title} • ${sampleTrack.artist}` : 'Curated Mix'}
                    </span>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', flexShrink: 0 }}>
                      <IconPlay size={16} color="#000000" fill="#000000" style={{ marginLeft: '2px' }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Mood & Genre Bento Cards */}
      {!searchQuery && (activeFilter === 'all' || activeFilter === 'moods') && (
        <section className="section-container">
          <div className="section-title-row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <IconFlame size={15} color="var(--text-muted)" />
                Browse by Mood & Genre
              </h2>
              {activeMood && (
                <span style={{ fontSize: '0.72rem', background: 'var(--accent-primary)', color: '#000000', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-pill)', fontWeight: 800 }}>
                  ▶ {activeMood} ({activeMoodCount} queued)
                </span>
              )}
            </div>
            <span className="section-helper">Tap to play radio</span>
          </div>

          <div className="bento-genre-grid">
            {MOOD_CARDS.map((mood, idx) => {
              const sampleTrack = allTracks[idx % Math.max(1, allTracks.length)];
              const isActive = activeMood === mood.name;
              return (
                <div
                  key={mood.id}
                  className={`bento-genre-card ${isActive ? 'active' : ''}`}
                  style={{
                    background: mood.gradient,
                    border: isActive ? '2px solid var(--accent-primary)' : '1px solid rgba(255, 255, 255, 0.12)',
                    boxShadow: isActive ? '0 0 20px rgba(245, 158, 11, 0.45)' : 'none'
                  }}
                  onClick={() => handleMoodClick(mood)}
                >
                  {sampleTrack && sampleTrack.cover_art_path && (
                    <img
                      src={apiUrl(`/api/tracks/${sampleTrack.id}/art`)}
                      alt=""
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: 'blur(14px) saturate(1.3) opacity(0.32)',
                        transform: 'scale(1.25)',
                        pointerEvents: 'none'
                      }}
                    />
                  )}
                  <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className="bento-card-icon">{mood.icon}</span>
                    <IconFlame size={16} color={isActive ? 'var(--accent-primary)' : 'rgba(255,255,255,0.7)'} />
                  </div>
                  <div style={{ position: 'relative', zIndex: 2 }}>
                    <h3 className="bento-card-title">{mood.name}</h3>
                    <p className="bento-card-desc">{mood.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Most Recommended Section */}
      {!searchQuery && (activeFilter === 'all' || activeFilter === 'recommended') && (
        <section className="section-container">
          <div className="section-title-row">
            <div>
              <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <IconSparkles size={15} color="var(--text-muted)" />
                Most Recommended For You
              </h2>
            </div>
            <span style={{ fontSize: '0.74rem', background: 'rgba(78, 168, 222, 0.15)', color: 'var(--accent-primary)', padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-pill)', fontWeight: 700 }}>
              🔥 Top Rec Score
            </span>
          </div>

          <div className="horizontal-card-list">
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
                        src={apiUrl(`/api/tracks/${track.id}/art`)}
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

                    <div style={{
                      position: 'absolute',
                      top: '6px',
                      left: '6px',
                      background: 'rgba(14, 18, 26, 0.85)',
                      backdropFilter: 'blur(8px)',
                      padding: '2px 7px',
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
      )}

      {/* Full Song Catalog List / Live Search Results */}
      {(activeFilter === 'all' || activeFilter === 'catalog' || searchQuery) && (
        <section className="section-container">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconMusic size={15} color="var(--text-muted)" />
              {searchQuery ? `Search Results ("${searchQuery}")` : 'Full Song Catalog'}
            </h2>
            <span className="section-helper">
              {filteredCatalog.length} {filteredCatalog.length === 1 ? 'track' : 'tracks'}
            </span>
          </div>

          {loading ? (
            <div style={{ color: 'var(--text-muted)', padding: '1rem 0', textAlign: 'center' }}>Loading catalog...</div>
          ) : filteredCatalog.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><IconMusic size={26} /></div>
              <p className="empty-state-title">No matching tracks found</p>
              <p className="empty-state-sub">We couldn't find anything for "{searchQuery}". Try a different title, artist, or album.</p>
            </div>
          ) : (
            <div className="quick-picks-list">
              {filteredCatalog.map((track) => {
                const isFav = !!favoritesMap[track.id];
                return (
                  <div
                    key={track.id}
                    className="quick-pick-row"
                    onClick={() => playTrack(track, filteredCatalog)}
                    style={{ cursor: 'pointer' }}
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
      )}

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
