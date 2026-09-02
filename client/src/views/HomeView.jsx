import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { logRecommendationAction } from '../services/recommendationTelemetry';
import {
  IconPlay,
  IconHeart,
  IconPlus,
  IconMusic,
  IconSparkles,
  IconZap,
  IconRefresh
} from '../components/Icons';
import AddToPlaylistModal from '../components/AddToPlaylistModal';

const dedupe = (arr) => {
  const seen = new Set();
  return (arr || []).filter((t) => (t && t.id && !seen.has(t.id) ? (seen.add(t.id), true) : false));
};

const shelfHeading = (reason) => {
  const r = (reason || '').toLowerCase();
  if (r.includes('favorite artist') || r.includes('favorite genre')) return 'Because you like...';
  if (r.includes('similar to') || r.includes('great follow-up') || r.includes('frequently played after')) return 'Because you listened to...';
  if (r.includes('never played') || r.includes('hidden gem') || r.includes('discover')) return 'You might like...';
  if (r.includes('love to finish') || r.includes('favorited')) return 'Because you like...';
  return 'You might like...';
};

const SpeedDialPage = memo(function SpeedDialPage({ pageTracks, currentTrackId, onActivate, onFavorite, favoritesMap }) {
  return (
    <div className="speed-dial-page">
      <div className="speed-dial-grid">
        {pageTracks.map((track) => {
          const isCurrent = currentTrackId && currentTrackId === track.id;
          const isFav = !!favoritesMap[track.id];
          return (
            <div
              key={track.id}
              className={`speed-tile ${isCurrent ? 'active' : ''}`}
              onClick={() => onActivate(track, isCurrent)}
            >
              {track.cover_art_path ? (
                <img
                  src={`/api/tracks/${track.id}/art`}
                  alt={track.title}
                  className="speed-tile-art"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="speed-tile-fallback">
                  <IconMusic size={22} color="var(--accent-primary)" />
                </div>
              )}
              <div className="speed-tile-overlay">
                {isCurrent ? (
                  <div className="speed-tile-eq"><span /><span /><span /></div>
                ) : (
                  <div className="speed-tile-play">
                    <IconPlay size={14} color="#111" fill="#111" style={{ marginLeft: '1px' }} />
                  </div>
                )}
                <span className="speed-tile-label" title={track.title}>{track.title}</span>
              </div>
              <button
                className={`speed-tile-fav ${isFav ? 'is-fav' : ''}`}
                onClick={(e) => { e.stopPropagation(); onFavorite(track.id); }}
                title={isFav ? 'Remove from favorites' : 'Add to favorites'}
              >
                <IconHeart
                  size={14}
                  color={isFav ? 'var(--accent-crimson)' : 'rgba(255,255,255,0.85)'}
                  fill={isFav ? 'var(--accent-crimson)' : 'none'}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export default function HomeView() {
  const {
    currentTrack,
    isPlaying,
    recentlyPlayed,
    favoritesMap,
    playTrack,
    togglePlay,
    toggleFavorite,
    addToQueue
  } = usePlayer();

  const [speedDialTracks, setSpeedDialTracks] = useState([]);
  const [quickPicks, setQuickPicks] = useState([]);
  const [contextualShelves, setContextualShelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activePage, setActivePage] = useState(0);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);

  const carouselRef = useRef(null);
  const scrollTickRef = useRef(false);
  const scrollSettleRef = useRef(null);

  useEffect(() => {
    fetchSuggestedTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id, recentlyPlayed.length, favoritesMap]);

  const fetchSuggestedTracks = async () => {
    try {
      setLoading(true);
      const recUrl = `/api/tracks/recommendations${currentTrack ? `?currentTrackId=${currentTrack.id}` : ''}`;
      const resRec = await fetch(recUrl, { credentials: 'include' });
      if (resRec.ok) {
        const dataRec = await resRec.json();
        assembleHome(dataRec.tracks || []);
      }
    } catch (err) {
      console.error('Error fetching smart recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setActivePage(0);
    try {
      await fetchSuggestedTracks();
      if (carouselRef.current) {
        carouselRef.current.scrollTo({ left: 0, behavior: 'auto' });
      }
    } catch (err) {
      console.error('Error refreshing Home:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const assembleHome = (recs) => {
    const pool = dedupe(recs || []);

    // The /api/tracks/recommendations response is capped at 20 tracks by the
    // recommendation engine (count=20). Compose the surfaces from that single
    // deduplicated V2 pool without assuming a fixed total.
    //
    // Speed Dial: up to 18 tracks (two full 3x3 pages; a third page appears for
    // any leftover beyond 18). Quick Picks: the next 8 remaining tracks so it is
    // never a near-duplicate of Speed Dial. Contextual shelves: whatever is left
    // over after Speed Dial + Quick Picks. Never fabricate or duplicate tracks.
    const DIAL_CEIL = 18;
    setSpeedDialTracks(pool.slice(0, DIAL_CEIL));
    setQuickPicks(pool.slice(DIAL_CEIL).slice(0, 8));

    const grouped = new Map();
    for (const track of pool.slice(DIAL_CEIL + 8)) {
      const reason = (track.reason || '').trim() || 'Recommended for you';
      const key = reason.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, { reason, tracks: [] });
      grouped.get(key).tracks.push(track);
    }
    const shelves = [];
    for (const { reason, tracks } of grouped.values()) {
      const deduped = dedupe(tracks);
      if (deduped.length < 2) continue;
      shelves.push({ id: `ctx-${reason.toLowerCase()}`, reason, tracks: deduped.slice(0, 10) });
    }
    setContextualShelves(shelves);
  };

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

  const pages = [];
  const perPage = 9;
  for (let i = 0; i < speedDialTracks.length; i += perPage) {
    pages.push(speedDialTracks.slice(i, i + perPage));
  }

  const renderQuickPickCard = (track) => {
    const isCurrent = currentTrack && currentTrack.id === track.id;
    const isFav = !!favoritesMap[track.id];
    return (
      <div
        key={track.id}
        className={`shelf-card quick-pick-card ${isCurrent ? 'active' : ''}`}
        onClick={() => {
          logRecommendationAction(track.id, 'played', {
            shelfId: 'quickPicks', surface: 'quickPicks', source: 'home'
          });
          playTrack(track, quickPicks);
        }}
      >
        {track.cover_art_path ? (
          <img
            src={`/api/tracks/${track.id}/art`}
            alt={track.title}
            className="shelf-card-art"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="shelf-card-art fallback">
            <IconMusic size={24} color="var(--accent-primary)" />
          </div>
        )}
        {isCurrent && isPlaying && (
          <div className="shelf-card-eq"><span /><span /><span /></div>
        )}
        <div className="shelf-card-meta">
          <span className="shelf-card-title" title={track.title}>{track.title}</span>
          <span className="shelf-card-artist" title={track.artist}>{track.artist}</span>
        </div>
        <div className="quick-pick-card-actions">
          <button
            className="row-action-btn"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(track.id); }}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <IconHeart
              size={15}
              color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
              fill={isFav ? 'var(--accent-crimson)' : 'none'}
            />
          </button>
          <button
            className="row-action-btn"
            onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
            title="Add to queue"
          >
            <IconPlus size={15} color="var(--text-muted)" />
          </button>
          {!isCurrent && (
            <button
              className="row-action-btn"
              onClick={(e) => { e.stopPropagation(); playTrack(track, quickPicks); }}
              title="Play"
            >
              <IconPlay size={15} color="var(--text-muted)" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderShelfCard = (track, shelfTracks, shelfId) => {
    const isCurrent = currentTrack && currentTrack.id === track.id;
    return (
      <div
        key={track.id}
        className={`shelf-card ${isCurrent ? 'active' : ''}`}
        onClick={() => {
          logRecommendationAction(track.id, 'played', {
            shelfId, surface: shelfId, source: 'home'
          });
          playTrack(track, shelfTracks);
        }}
      >
        {track.cover_art_path ? (
          <img
            src={`/api/tracks/${track.id}/art`}
            alt={track.title}
            className="shelf-card-art"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="shelf-card-art fallback">
            <IconMusic size={24} color="var(--accent-primary)" />
          </div>
        )}
        {isCurrent && isPlaying && (
          <div className="shelf-card-eq"><span /><span /><span /></div>
        )}
        <div className="shelf-card-meta">
          <span className="shelf-card-title" title={track.title}>{track.title}</span>
          <span className="shelf-card-artist" title={track.artist}>{track.artist}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="bento-home-container">
      <div className="bento-header">
        <h1 className="view-title">Listen Now</h1>
        <p className="view-subtitle">Recommendations curated by Octave for you</p>
      </div>

      {/* Speed Dial — primary recommendation discovery surface */}
      <section className="home-section">
        <div className="bento-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="bento-section-title">
            <IconZap size={18} color="var(--accent-primary)" />
            <h2>Speed Dial</h2>
          </div>
          <button
            className="btn-secondary"
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <IconRefresh size={14} color="var(--accent-primary)" />
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
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
                  onFavorite={toggleFavorite}
                  favoritesMap={favoritesMap}
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
          <div className="empty-bento-box">
            <IconMusic size={24} color="var(--text-muted)" />
            <span>No recommendations yet. Play some music to help Octave learn your taste.</span>
          </div>
        )}
      </section>

      {/* Quick Picks — a polished recommendation shelf (no overlap with Speed Dial) */}
      {quickPicks.length > 0 && (
        <section className="home-section">
          <div className="bento-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="bento-section-title">
              <IconSparkles size={18} color="var(--accent-primary)" />
              <h2>Quick Picks</h2>
            </div>
            {quickPicks.length > 0 && (
              <button
                className="btn-secondary"
                style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
                onClick={() => {
                  logRecommendationAction(quickPicks[0].id, 'played', {
                    shelfId: 'quickPicks', surface: 'quickPicks', source: 'home'
                  });
                  playTrack(quickPicks[0], quickPicks);
                }}
              >
                Play All
              </button>
            )}
          </div>

          <div className="shelf-row quick-picks-grid">
            {quickPicks.map(renderQuickPickCard)}
          </div>
        </section>
      )}

      {/* Contextual recommendation shelves (grouped by backend reason fields) */}
      {contextualShelves.map((shelf) => (
        <section key={shelf.id} className="home-section">
          <div className="bento-section-header">
            <div className="bento-section-title">
              <IconSparkles size={18} color="var(--accent-primary)" />
              <h2>{shelfHeading(shelf.reason)}</h2>
            </div>
            <p className="bento-section-subtitle" title={shelf.reason}>{shelf.reason}</p>
          </div>

          <div className="shelf-row">
            {shelf.tracks.map((t) => renderShelfCard(t, shelf.tracks, shelf.id))}
          </div>
        </section>
      ))}

      {selectedTrackForPlaylist && (
        <AddToPlaylistModal
          track={selectedTrackForPlaylist}
          onClose={() => setSelectedTrackForPlaylist(null)}
        />
      )}
    </div>
  );
}
