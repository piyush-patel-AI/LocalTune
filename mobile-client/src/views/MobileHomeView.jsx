import { useState, useEffect, useRef, useCallback, memo } from 'react';
import logo from '../../../Assets/logo.png';
import { usePlayer } from '../context/PlayerContext';
import TrackActionSheet from '../components/TrackActionSheet';
import { getArtworkUrl } from '../services/MediaMetadataProvider';
import ArtworkImage from '../components/ArtworkImage';
import {
  IconChevronRight,
  IconMoreVertical,
  IconMusic,
  IconRefresh,
  IconPlay,
  IconPause,
  IconSparkles,
  IconHeart,
  IconZap,
  IconClock
} from '../components/Icons';
import { apiUrl } from '../config';

const CATEGORIES = ['All', 'Chill', 'Energy', 'Focus', 'Workout', 'Late Night', 'Acoustic'];

// Memoized so the Speed Dial tiles do not re-render during a swipe when only
// the active page indicator (activePage) changes. Props are stable while the
// user scrolls: track data is unchanged and currentTrackId only changes on
// playback events, not on scroll.
const SpeedDialPage = memo(function SpeedDialPage({ pageTracks, currentTrackId, onActivate }) {
  return (
    <div className="speed-dial-page">
      <div className="speed-dial-asymmetric-grid">
        {pageTracks.map((track, trackIdx) => {
          const isCurrent = currentTrackId && currentTrackId === track.id;
          const isHeroTile = trackIdx === 0;
          return (
            <div
              key={track.id}
              className={`speed-dial-tile ${isHeroTile ? 'large' : ''} ${isCurrent ? 'active' : ''}`}
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
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function MobileHomeView() {
  const { currentTrack, isPlaying, playTrack, togglePlay, recentlyPlayed, favoritesMap, toggleFavorite, navigateToArtist } = usePlayer();
  const [activeCategory, setActiveCategory] = useState('All');
  const [allTracks, setAllTracks] = useState([]);
  const [recommendedTracks, setRecommendedTracks] = useState([]);
  const [artists, setArtists] = useState([]);
  const [speedDialTracks, setSpeedDialTracks] = useState([]);
  const [quickPickTracks, setQuickPickTracks] = useState([]);
  const [activePage, setActivePage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedTrackForAction, setSelectedTrackForAction] = useState(null);

  const carouselRef = useRef(null);
  const scrollTickRef = useRef(false);
  const scrollSettleRef = useRef(null);

  // Continue Listening carousel state
  const continueRef = useRef(null);
  const [continueIdx, setContinueIdx] = useState(0);
  const pointerRef = useRef({ active: false, startX: 0, startY: 0, dx: 0 });

  useEffect(() => {
    fetchHomeData();
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

    setSpeedDialTracks(filtered.slice(0, 18));
    setQuickPickTracks(filtered.slice(0, 15));
  };

  const handleRefreshSpeedDial = () => {
    const shuffled = [...recommendedTracks].sort(() => 0.5 - Math.random());
    setSpeedDialTracks(shuffled.slice(0, 18));
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
      playTrack(track, speedDialTracks);
    }
  }, [togglePlay, playTrack, speedDialTracks]);

  const continueListeningTracks = (recentlyPlayed || []).filter(
    (t) => t && t.id && t.title
  );
  const continueCount = continueListeningTracks.length;

  // Clamp continue index when list shrinks
  useEffect(() => {
    if (continueCount === 0) {
      setContinueIdx(0);
    } else if (continueIdx >= continueCount) {
      setContinueIdx(continueCount - 1);
    }
  }, [continueCount, continueIdx]);

  // Continue Listening carousel — simple pointer-based horizontal drag
  const SNAP_W = 320; // approx card + gap, recalculated per-card in handler

  const continuePointerDown = useCallback((e) => {
    if (continueCount <= 1) return;
    const el = continueRef.current;
    if (!el) return;
    pointerRef.current = { active: true, startX: e.clientX, startY: e.clientY, dx: 0 };
    el.style.transition = 'none';
  }, [continueCount]);

  const continuePointerMove = useCallback((e) => {
    if (!pointerRef.current.active) return;
    const el = continueRef.current;
    if (!el) return;
    const dx = e.clientX - pointerRef.current.startX;
    const dy = e.clientY - pointerRef.current.startY;
    // Only intercept horizontal swipes — let vertical scroll pass through
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(pointerRef.current.dx) < 8) return;
    pointerRef.current.dx = dx;
    const cardW = el.children[0] ? el.children[0].getBoundingClientRect().width + 16 : SNAP_W;
    const offset = -(continueIdx * cardW) + dx;
    el.style.transform = `translate3d(${offset}px, 0, 0)`;
  }, [continueIdx]);

  const continuePointerUp = useCallback(() => {
    if (!pointerRef.current.active) return;
    pointerRef.current.active = false;
    const el = continueRef.current;
    if (!el) return;
    const dx = pointerRef.current.dx;
    const cardW = el.children[0] ? el.children[0].getBoundingClientRect().width + 16 : SNAP_W;
    let next = continueIdx;
    if (Math.abs(dx) > cardW * 0.18) {
      next = dx < 0
        ? Math.min(continueIdx + 1, continueCount - 1)
        : Math.max(continueIdx - 1, 0);
    }
    setContinueIdx(next);
    el.style.transition = 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)';
    el.style.transform = `translate3d(${-(next * cardW)}px, 0, 0)`;
  }, [continueIdx, continueCount]);

  const madeForYouList = recommendedTracks.slice(0, 10);
  const topArtists = artists.slice(0, 8);

  // Asymmetric speed dial pagination (6 tracks per page: 1 Large + 5 Medium = 6 items filling 3x3 grid completely including corner piece)
  const pages = [];
  for (let i = 0; i < speedDialTracks.length; i += 6) {
    let pageItems = speedDialTracks.slice(i, i + 6);
    if (pageItems.length > 0 && pageItems.length < 6 && speedDialTracks.length >= 6) {
      const extraNeeded = 6 - pageItems.length;
      const padTracks = speedDialTracks.filter((t) => !pageItems.includes(t)).slice(0, extraNeeded);
      pageItems = [...pageItems, ...padTracks];
    }
    pages.push(pageItems);
  }

  return (
    <div className="mobile-home-view animate-fade-in">
      {/* Hero "Continue Listening" Carousel */}
      {continueListeningTracks.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div className="section-title-row" style={{ padding: '0 1.25rem' }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconClock size={15} color="var(--text-muted)" />
              Continue Listening
            </h2>
            {continueListeningTracks.length > 1 && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {continueIdx + 1} / {continueListeningTracks.length}
              </span>
            )}
          </div>

          <div
            className="continue-listening-viewport"
            onPointerDown={continuePointerDown}
            onPointerMove={continuePointerMove}
            onPointerUp={continuePointerUp}
            onPointerCancel={continuePointerUp}
          >
            <div
              className="continue-listening-track"
              ref={continueRef}
              style={{ transform: `translate3d(0, 0, 0)` }}
            >
              {continueListeningTracks.map((track) => {
                const isCurrent = currentTrack && currentTrack.id === track.id;
                return (
                  <div
                    key={track.id}
                    className="hero-continue-card"
                    onClick={() => {
                      if (isCurrent) {
                        togglePlay();
                      } else {
                        playTrack(track, continueListeningTracks);
                      }
                    }}
                  >
                    <div className="hero-tag">
                      <IconSparkles size={13} color="var(--accent-primary)" />
                      <span>{isCurrent && isPlaying ? 'NOW PLAYING' : 'CONTINUE LISTENING'}</span>
                    </div>

                    <div className="hero-content-flex" style={{ alignItems: 'center' }}>
                      <div className="hero-art-wrapper" style={{ width: '64px', height: '64px', flexShrink: 0 }}>
                        <ArtworkImage
                          src={getArtworkUrl(track, 256)}
                          alt={track.title}
                          className="hero-art-img"
                          eager
                          onError={(e) => { e.target.src = logo; }}
                        />
                        <div className="hero-play-fab" style={{ width: '28px', height: '28px' }}>
                          {isCurrent && isPlaying ? (
                            <IconPause size={14} color="#000000" fill="#000000" />
                          ) : (
                            <IconPlay size={14} color="#000000" fill="#000000" style={{ marginLeft: '1px' }} />
                          )}
                        </div>
                      </div>

                      <div className="hero-info-text" style={{ flex: 1, minWidth: 0 }}>
                        <h2 className="hero-title" style={{ fontSize: '1.05rem' }}>{track.title}</h2>
                        <p className="hero-artist" style={{ fontSize: '0.8rem' }}>{track.artist} • {track.album || 'Single'}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {continueListeningTracks.length > 1 && (
            <div className="continue-listening-dots">
              {continueListeningTracks.map((_, dotIdx) => (
                <span
                  key={dotIdx}
                  className={`continue-dot ${continueIdx === dotIdx ? 'active' : ''}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* "Made For You" Horizontal Carousel */}
      <section className="section-container">
        <div className="section-title-row">
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <IconSparkles size={15} color="var(--text-muted)" />
            Made For You
          </h2>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Personalized</span>
        </div>

        <div className="horizontal-card-list">
          {madeForYouList.map((track) => (
            <div
              key={track.id}
              className="media-card"
              onClick={() => playTrack(track, madeForYouList)}
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
              </div>
              <span className="media-card-title">{track.title}</span>
              <span className="media-card-sub">{track.artist}</span>
            </div>
          ))}
        </div>
      </section>

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

      {/* Speed Dial Asymmetric Section with Inline Refresh Button */}
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
              style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
            >
              <IconRefresh size={15} color="var(--text-muted)" />
            </button>
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Swipe for more</span>
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
                />
              ))}
            </div>

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
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon"><IconMusic size={26} /></div>
            <p className="empty-state-title">Your library is empty</p>
            <p className="empty-state-sub">Add some music to start building your Speed Dial and recommendations.</p>
          </div>
        )}
      </section>

      {/* Quick Picks Track List (Compact Apple Music Style Row Height) */}
      <section className="section-container" style={{ paddingBottom: '2rem' }}>
        <div className="section-title-row">
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <IconPlay size={15} color="var(--text-muted)" />
            Quick Picks
          </h2>
          <button
            className="btn-secondary"
            onClick={() => {
              if (quickPickTracks.length > 0) {
                playTrack(quickPickTracks[0], quickPickTracks);
              }
            }}
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
          >
            Play All
          </button>
        </div>

        {quickPickTracks.length > 0 && (
          <div className="quick-picks-list">
            {quickPickTracks.map((track) => {
              const isCurrent = currentTrack && currentTrack.id === track.id;
              const isFav = !!favoritesMap[track.id];
              return (
                <div
                  key={track.id}
                  className={`quick-pick-row ${isCurrent ? 'active' : ''}`}
                  onClick={() => playTrack(track, quickPickTracks)}
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
        )}
      </section>

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
