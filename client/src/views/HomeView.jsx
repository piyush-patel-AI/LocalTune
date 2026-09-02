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
  IconDisc,
  IconZap,
  IconRefresh
} from '../components/Icons';
import AddToPlaylistModal from '../components/AddToPlaylistModal';

const SPEED_DIAL_SIZE = 9;

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

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

  const [suggestedTracks, setSuggestedTracks] = useState([]);
  const [allTracks, setAllTracks] = useState([]);
  const [speedDialTracks, setSpeedDialTracks] = useState([]);
  const [quickPicks, setQuickPicks] = useState([]);
  const [contextualShelves, setContextualShelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);

  useEffect(() => {
    fetchSuggestedTracks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const tracks = dataRec.tracks || [];
        setSuggestedTracks(tracks);
        assembleHome(tracks);
      }
    } catch (err) {
      console.error('Error fetching smart recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  // Refresh uses the real recommendation/data pipeline (no client randomizer).
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchSuggestedTracks();
    } catch (err) {
      console.error('Error refreshing Home:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const assembleHome = (recs) => {
    const recTracks = recs || suggestedTracks || [];
    // Speed Dial: primarily recent listening, up to 9 in a compact 3x3 grid,
    // optionally enriched with up to 2 strong V2 candidates. Never duplicates.
    const seen = new Set();
    const take = (arr) => (arr || []).filter((t) => (t && t.id && !seen.has(t.id) ? (seen.add(t.id), true) : false));

    const recents = (recentlyPlayed || []).filter((t) => t && t.id && t.title);
    let speed = take(recents).slice(0, SPEED_DIAL_SIZE);

    if (speed.length < SPEED_DIAL_SIZE) {
      const strongRecs = recTracks.filter((t) => t && t.id && t.score != null && t.score > 0);
      const extra = take(strongRecs).slice(0, SPEED_DIAL_SIZE - speed.length);
      speed = [...speed, ...extra];
    }
    setSpeedDialTracks(speed.slice(0, SPEED_DIAL_SIZE));

    // Quick Picks: the first strongly-recommended V2 tracks.
    const pool = dedupe(recTracks);
    setQuickPicks(pool.slice(0, 8));

    // Contextual shelves grouped by the backend-provided `reason` field.
    const grouped = new Map();
    for (const track of pool) {
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

  const renderSpeedTile = (track) => {
    const isCurrent = currentTrack && currentTrack.id === track.id;
    const isFav = !!favoritesMap[track.id];
    return (
      <div
        key={track.id}
        className={`speed-tile ${isCurrent ? 'active' : ''}`}
        onClick={() => {
          if (isCurrent) {
            togglePlay();
          } else {
            logRecommendationAction(track.id, 'played', {
              shelfId: 'speedDial', surface: 'speedDial', source: 'home'
            });
            playTrack(track, speedDialTracks);
          }
        }}
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
          {isCurrent && isPlaying ? (
            <div className="speed-tile-eq">
              <span /><span /><span />
            </div>
          ) : (
            <div className="speed-tile-play">
              <IconPlay size={14} color="#111" fill="#111" style={{ marginLeft: '1px' }} />
            </div>
          )}
          <span className="speed-tile-label" title={track.title}>{track.title}</span>
        </div>
        <button
          className={`speed-tile-fav ${isFav ? 'is-fav' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(track.id);
          }}
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
  };

  const renderQuickPickRow = (track) => {
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
          playTrack(track, quickPicks);
        }}
      >
        {track.cover_art_path ? (
          <img
            src={`/api/tracks/${track.id}/art`}
            alt={track.title}
            className="row-art"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="row-art fallback">
            <IconMusic size={16} color="var(--accent-primary)" />
          </div>
        )}
        <div className="row-text">
          <span className="row-title" title={track.title}>{track.title}</span>
          <span className="row-artist" title={track.artist}>{track.artist}</span>
        </div>
        <div className="row-actions">
          <button
            className="row-action-btn"
            onClick={(e) => { e.stopPropagation(); toggleFavorite(track.id); }}
            title="Add to favorites"
          >
            <IconHeart
              size={16}
              color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
              fill={isFav ? 'var(--accent-crimson)' : 'none'}
            />
          </button>
          <button
            className="row-action-btn"
            onClick={(e) => { e.stopPropagation(); addToQueue(track); }}
            title="Add to queue"
          >
            <IconPlus size={16} color="var(--text-muted)" />
          </button>
          {isCurrent && isPlaying ? (
            <div className="row-eq"><span /><span /><span /></div>
          ) : (
            <button
              className="row-action-btn"
              onClick={(e) => { e.stopPropagation(); playTrack(track, quickPicks); }}
              title="Play"
            >
              <IconPlay size={16} color="var(--text-muted)" />
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
        <p className="view-subtitle">Recent listening, quick picks & contextual recommendations</p>
      </div>

      {/* Speed Dial — primary content section */}
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
        ) : speedDialTracks.length > 0 ? (
          <div className="speed-dial-grid">
            {speedDialTracks.map(renderSpeedTile)}
          </div>
        ) : (
          <div className="empty-bento-box">
            <IconMusic size={24} color="var(--text-muted)" />
            <span>No tracks found in library. Add some music to start building your Speed Dial.</span>
          </div>
        )}
      </section>

      {/* Quick Picks — first clearly recommendation-focused shelf */}
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

          <div className="quick-picks-card">
            {quickPicks.map(renderQuickPickRow)}
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
