import { useState, useEffect, useRef, useCallback, memo } from 'react';
import logo from '../../../Assets/logo.png';
import { usePlayer } from '../context/PlayerContext';
import TrackActionSheet from '../components/TrackActionSheet';
import { getArtworkUrl } from '../services/MediaMetadataProvider';
import ArtworkImage from '../components/ArtworkImage';
import { logRecommendationAction } from '../services/recommendationTelemetry';
import {
  IconMoreVertical,
  IconMusic,
  IconRefresh,
  IconPlay,
  IconPause,
  IconSparkles,
  IconHeart,
  IconZap
} from '../components/Icons';
import { apiUrl } from '../config';

const CATEGORIES = ['All', 'Chill', 'Energy', 'Focus', 'Workout', 'Late Night', 'Acoustic'];

// Subtle, dark ambient tints for the top glow on Home. Purely decorative and
// independent of the playing artwork. One is selected ONCE when this module
// loads, so it stays stable across re-renders, scroll, playback/progress and
// tab switches, and only changes again on a full page reload.
const HOME_RIM_GRADIENTS = [
  'radial-gradient(130% 100% at 50% 0%, rgba(37, 99, 235, 0.13), transparent 68%)',
  'radial-gradient(130% 100% at 50% 0%, rgba(139, 92, 246, 0.11), transparent 68%)',
  'radial-gradient(130% 100% at 50% 0%, rgba(34, 211, 238, 0.10), transparent 68%)',
  'radial-gradient(130% 100% at 50% 0%, rgba(79, 70, 229, 0.12), transparent 68%)',
  'radial-gradient(130% 100% at 50% 0%, rgba(217, 70, 239, 0.09), transparent 68%)',
  'radial-gradient(130% 100% at 50% 0%, rgba(45, 212, 191, 0.09), transparent 68%)',
  'radial-gradient(130% 100% at 50% 0%, rgba(217, 119, 6, 0.08), transparent 68%)'
];
const HOME_TOP_GRADIENT = HOME_RIM_GRADIENTS[Math.floor(Math.random() * HOME_RIM_GRADIENTS.length)];

// Memoized so the Speed Dial tiles do not re-render during a swipe when only
// the active page indicator (activePage) changes. Props are stable while the
// user scrolls: track data is unchanged and currentTrackId only changes on
// playback events, not on scroll.
const SpeedDialPage = memo(function SpeedDialPage({ pageTracks, currentTrackId, onActivate, onOptions }) {
  return (
    <div className="speed-dial-page">
      <div className="speed-dial-grid">
        {pageTracks.map((track) => {
          const isCurrent = currentTrackId && currentTrackId === track.id;
          return (
            <div
              key={track.id}
              className={`speed-dial-tile ${isCurrent ? 'active' : ''}`}
              onClick={() => onActivate(track, isCurrent)}
            >
              <ArtworkImage
                src={getArtworkUrl(track, 256)}
                alt={track.title}
                className="tile-art"
                onError={(e) => { e.target.src = logo; }}
              />
              <div className="tile-gradient-overlay">
                <span className="tile-overlay-text">{track.title}</span>
              </div>
              {onOptions && (
                <button
                  className="tile-more-btn"
                  onClick={(e) => { e.stopPropagation(); onOptions(track); }}
                  aria-label="More options"
                >
                  <IconMoreVertical size={14} color="rgba(255,255,255,0.9)" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function MobileHomeView() {
  const { currentTrack, isPlaying, playTrack, togglePlay, favoritesMap, toggleFavorite, navigateToArtist } = usePlayer();
  const [activeCategory, setActiveCategory] = useState('All');
  const [allTracks, setAllTracks] = useState([]);
  const [recommendedTracks, setRecommendedTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [speedDialTracks, setSpeedDialTracks] = useState([]);
  const [quickPickTracks, setQuickPickTracks] = useState([]);
  const [contextualShelves, setContextualShelves] = useState([]);
  const [activePage, setActivePage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTrackForAction, setSelectedTrackForAction] = useState(null);

  const carouselRef = useRef(null);
  const scrollTickRef = useRef(false);
  const scrollSettleRef = useRef(null);

  // Force full re-fetch when the current track changes so recommendations and
  // contextual shelves reflect the current session.
  useEffect(() => {
    fetchHomeData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  useEffect(() => {
    filterAndOrganize(activeCategory);
  }, [recommendedTracks, allTracks, activeCategory]);

  const fetchHomeData = async () => {
    try {
      setLoading(true);
      const [tracksRes, recsRes, artistsRes] = await Promise.all([
        fetch(apiUrl('/api/tracks'), { credentials: 'include' }),
        fetch(apiUrl(`/api/tracks/recommendations${currentTrack ? `?currentTrackId=${currentTrack.id}` : ''}`), { credentials: 'include' }),
        fetch(apiUrl('/api/tracks?groupBy=artist'), { credentials: 'include' })
      ]);

      let tracksList = [];
      if (tracksRes.ok) {
        const dataAll = await tracksRes.json();
        tracksList = dataAll.tracks || [];
        setAllTracks(tracksList);
      }

      if (recsRes.ok) {
        const dataRec = await recsRes.json();
        const recs = dataRec.tracks || [];
        setRecommendedTracks(recs.length > 0 ? recs : tracksList);
      } else {
        setRecommendedTracks(tracksList);
      }

      if (artistsRes.ok) {
        const dataArt = await artistsRes.json();
        setArtists(dataArt.artists || []);
      }
    } catch (err) {
      console.error('Error fetching mobile home data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Refresh uses the real recommendation/data pipeline (no client randomizer).
  const handleRefreshSpeedDial = async () => {
    setRefreshing(true);
    try {
      await fetchHomeData();
      filterAndOrganize(activeCategory);
    } catch (err) {
      console.error('Error refreshing Speed Dial:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const filterAndOrganize = (category) => {
    const baseList = recommendedTracks.length > 0 ? recommendedTracks : allTracks;
    let filtered = [...baseList];

    if (category !== 'All') {
      const kw = category.toLowerCase();
      filtered = baseList.filter(
        (t) =>
          (t.genre && t.genre.toLowerCase().includes(kw)) ||
          (t.title && t.title.toLowerCase().includes(kw)) ||
          (t.artist && t.artist.toLowerCase().includes(kw)) ||
          (t.album && t.album.toLowerCase().includes(kw))
      );

      if (filtered.length < 9) {
        const remaining = baseList.filter((t) => !filtered.includes(t));
        filtered = [...filtered, ...remaining];
      }
    }

    assembleHome(filtered, category);
  };

  // Builds the Home shelf hierarchy from existing fetched data:
  //   - Speed Dial = all V2 recommendations, paginated by 9
  //   - Quick Picks = next 8 after Speed Dial pool (no overlap)
  //   - Contextual shelves = grouped by the backend's own `reason` fields
  const assembleHome = (recommendationPool, category) => {
    const dedupe = (arr) => {
      const seen = new Set();
      return arr.filter((t) => (t && t.id && !seen.has(t.id) ? (seen.add(t.id), true) : false));
    };

    const allRecs = dedupe(
      (recommendationPool || []).filter((t) => t && t.id && t.score != null && t.score > 0)
    );

    // Speed Dial: all V2 recommendations, paginated by 9 in the render.
    setSpeedDialTracks(allRecs);

    // Quick Picks: next 8 after the Speed Dial pool — no overlap.
    const afterDial = allRecs.slice(27);
    const pool = dedupe(recommendationPool);
    setQuickPickTracks(afterDial.length > 0 ? afterDial.slice(0, 8) : pool.slice(0, 8));

    // Contextual shelves: remaining recs grouped by backend reason field.
    const afterQP = allRecs.slice(35);
    const grouped = new Map();
    for (const track of afterQP) {
      const reason = (track.reason || '').trim() || 'Recommended for you';
      const reasonKey = reason.toLowerCase();
      if (!grouped.has(reasonKey)) grouped.set(reasonKey, { reason, tracks: [] });
      grouped.get(reasonKey).tracks.push(track);
    }

    const shelves = [];
    for (const [key, { reason, tracks }] of grouped) {
      const deduped = dedupe(tracks);
      if (deduped.length < 2) continue;
      shelves.push({
        id: `ctx-${key}`,
        reason,
        tracks: deduped.slice(0, 10)
      });
    }

    const contextual = shelves.filter((s) => !['quickPicks'].includes(s.id));
    setContextualShelves(contextual);
  };

  // Throttle scroll → state update to one per animation frame so React state
  // is not updated on every scroll event. This also avoids re-rendering the
  // whole view mid-swipe; only the active-page indicator changes, and the
  // Speed Dial pages are memoized so they don't re-render.
  const handleScroll = useCallback(() => {
    if (!carouselRef.current || scrollTickRef.current) return;
    scrollTickRef.current = true;
    requestAnimationFrame(() => {
      scrollTickRef.current = false;
      const { scrollLeft, clientWidth } = carouselRef.current;
      if (clientWidth > 0) {
        const pageIndex = Math.round(scrollLeft / clientWidth);
        setActivePage((prev) => (prev === pageIndex ? prev : pageIndex));
      }
      if (scrollSettleRef.current) clearTimeout(scrollSettleRef.current);
      scrollSettleRef.current = setTimeout(() => {
        if (carouselRef.current) {
          const { scrollLeft: sl, clientWidth: cw } = carouselRef.current;
          if (cw > 0) {
            const idx = Math.round(sl / cw);
            setActivePage((prev) => (prev === idx ? prev : idx));
          }
        }
      }, 180);
    });
  }, []);

  const handleTileActivate = useCallback((track, isCurrent) => {
    if (isCurrent) {
      togglePlay();
    } else {
      logRecommendationAction(track.id, 'played', {
        shelfId: 'speedDial', surface: 'speedDial', source: 'home'
      });
      playTrack(track, speedDialTracks);
    }
  }, [togglePlay, playTrack, speedDialTracks]);

  const topArtists = artists.slice(0, 8);

  // Compact 3x3 Speed Dial pagination — up to 9 tracks per page, no dups.
  const pages = [];
  const perPage = 9;
  for (let i = 0; i < speedDialTracks.length; i += perPage) {
    pages.push(speedDialTracks.slice(i, i + perPage));
  }

  const shelfHeading = (reason) => {
    const r = (reason || '').toLowerCase();
    if (r.includes('favorite artist')) return 'Because you like...';
    if (r.includes('favorite genre')) return 'Because you like...';
    if (r.includes('similar to') || r.includes('great follow-up') || r.includes('frequently played after')) return 'Because you listened to...';
    if (r.includes('never played') || r.includes('hidden gem') || r.includes('discover')) return 'You might like...';
    if (r.includes('love to finish') || r.includes('favorited')) return 'Because you like...';
    return 'You might like...';
  };

  return (
    <div className="mobile-home-view animate-fade-in">
      <div className="home-top-gradient" aria-hidden="true" style={{ background: HOME_TOP_GRADIENT }} />

      {/* "Favorite Artists" Circular Avatars Row */}
      {topArtists.length > 0 && (
        <section className="section-container">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconMusic size={15} color="var(--text-muted)" />
              Favorite Artists
            </h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Personalized</span>
          </div>

          <div className="artist-circle-list">
            {topArtists.map((art, idx) => (
              <div
                key={`${art.artist}-${idx}`}
                className="artist-circle-item"
                onClick={() => navigateToArtist(art)}
                style={{ cursor: 'pointer' }}
                title={`View ${art.artist}`}
              >
                <div className="artist-avatar-ring">
                  {art.artist_image_path ? (
                     <ArtworkImage
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
                <span className="artist-circle-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>
                  {art.artist}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Speed Dial — primary content section, compact 3x3 grid */}
      <section className="section-container">
        <div className="section-title-row" style={{ marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconZap size={15} color="var(--text-muted)" />
              Speed Dial
            </h2>
            <button
              className="icon-btn"
              onClick={handleRefreshSpeedDial}
              title="Refresh Speed Dial"
              disabled={refreshing}
              style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
            >
              <IconRefresh size={15} color="var(--text-muted)" />
            </button>
          </div>
          {pages.length > 1 ? (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Swipe for more</span>
          ) : (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Recommendations for you</span>
          )}
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Loading tracks...</div>
        ) : pages.length > 0 ? (
          <>
            <div className="speed-dial-carousel-container" ref={carouselRef} onScroll={handleScroll}>
              {pages.map((pageTracks, pageIdx) => (
                <SpeedDialPage
                  key={pageIdx}
                  pageTracks={pageTracks}
                  currentTrackId={currentTrack?.id}
                  onActivate={handleTileActivate}
                  onOptions={setSelectedTrackForAction}
                />
              ))}
            </div>

            {pages.length > 1 && (
              <div className="speed-dial-pagination">
                {pages.map((_, dotIdx) => (
                  <span
                    key={dotIdx}
                    className={`page-dot ${activePage === dotIdx ? 'active' : ''}`}
                    onClick={() => {
                      if (carouselRef.current) {
                        carouselRef.current.scrollTo({
                          left: dotIdx * carouselRef.current.clientWidth,
                          behavior: 'smooth'
                        });
                      }
                    }}
                    title={`Go to page ${dotIdx + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><IconMusic size={26} /></div>
            <p className="empty-state-title">Your library is empty</p>
            <p className="empty-state-sub">Add some music to start building your Speed Dial and recommendations.</p>
          </div>
        )}
      </section>

      {/* Quick Picks — first clearly recommendation-focused shelf, directly below Speed Dial */}
      {quickPickTracks.length > 0 && (
        <section className="section-container">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconPlay size={15} color="var(--text-muted)" />
              Quick Picks
            </h2>
            <button
              className="btn-secondary"
              onClick={() => {
                if (quickPickTracks.length > 0) {
                  logRecommendationAction(quickPickTracks[0].id, 'played', {
                    shelfId: 'quickPicks', surface: 'quickPicks', source: 'home'
                  });
                  playTrack(quickPickTracks[0], quickPickTracks);
                }
              }}
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
            >
              Play All
            </button>
          </div>

          <div className="quick-picks-list">
            {quickPickTracks.map((track) => {
              const isCurrent = currentTrack && currentTrack.id === track.id;
              const isFav = !!favoritesMap[track.id];
              return (
                <div
                  key={track.id}
                  className={`quick-pick-row ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    logRecommendationAction(track.id, 'played', {
                      shelfId: 'quickPicks', surface: 'quickPicks', source: 'home'
                    });
                    playTrack(track, quickPickTracks);
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
                      <span className="row-artist">{track.artist}</span>
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
                      onClick={() => setSelectedTrackForAction(track)}
                      title="More Options"
                    >
                      <IconMoreVertical size={18} color="var(--text-muted)" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Contextual recommendation shelves (grouped by backend reason fields) */}
      {contextualShelves.map((shelf) => (
        <section key={shelf.id} className="section-container">
          <div className="section-title-row">
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconSparkles size={15} color="var(--text-muted)" />
              {shelfHeading(shelf.reason)}
            </h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Recommended</span>
          </div>

          <div className="horizontal-card-list">
            {shelf.tracks.map((track) => {
              const isCurrent = currentTrack && currentTrack.id === track.id;
              return (
                <div
                  key={track.id}
                  className="media-card"
                  onClick={() => {
                    logRecommendationAction(track.id, 'played', {
                      shelfId: shelf.id, surface: shelf.id, source: 'home'
                    });
                    playTrack(track, shelf.tracks);
                  }}
                >
                  <div className="media-card-art-box">
                    <ArtworkImage
                      src={getArtworkUrl(track, 256)}
                      alt={track.title}
                      className="media-card-art"
                      onError={(e) => { e.target.src = logo; }}
                    />
                    <div className="media-card-play-hover">
                      <IconPlay size={18} color="#000000" fill="#000000" style={{ marginLeft: '2px' }} />
                    </div>
                    {isCurrent && isPlaying && <div className="media-card-eq"><IconPause size={14} color="#000" fill="#000" /></div>}
                  </div>
                  <span className="media-card-title">{track.title}</span>
                  <span className="media-card-sub">{track.artist}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Action Sheet Modal */}
      {selectedTrackForAction && (
        <TrackActionSheet
          track={selectedTrackForAction}
          onClose={() => setSelectedTrackForAction(null)}
        />
      )}
    </div>
  );
}
