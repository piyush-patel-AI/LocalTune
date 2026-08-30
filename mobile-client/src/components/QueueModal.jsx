import { useState, useEffect, useCallback } from 'react';
import logo from '../../../Assets/logo.png';
import { usePlayer } from '../context/PlayerContext';
import { getArtworkUrl } from '../services/MediaMetadataProvider';
import BottomSheet from './BottomSheet';
import { IconMusic, IconPlus, IconPlay, IconTrash } from './Icons';
import { apiUrl } from '../config';

const RECS_LIMIT = 10;

export default function QueueModal() {
  const {
    isQueueOpen,
    closeQueue,
    queue,
    currentTrack,
    playTrack,
    removeFromQueue,
    clearQueue,
    addToQueue
  } = usePlayer();

  const [candidatePool, setCandidatePool] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecs, setLoadingRecs] = useState(false);

  // Filter the candidate pool down to songs that are NOT currently playing and
  // NOT already queued, deduplicating by id. This reacts to the live queue.
  const buildRecommendations = useCallback((pool, queueList, curTrack) => {
    const excluded = new Set(queueList.map((t) => t && t.id));
    if (curTrack && curTrack.id) excluded.add(curTrack.id);

    const seen = new Set();
    const result = [];
    for (const t of pool) {
      if (!t || !t.id) continue;
      if (excluded.has(t.id)) continue;
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      result.push(t);
      if (result.length >= RECS_LIMIT) break;
    }
    return result;
  }, []);

  // Fetch a layered candidate pool: personalized recommendations first, then
  // the full library/catalog as a fallback so we can always surface a
  // replacement. Uses the existing recommendation infrastructure (currentTrackId
  // personalization); no refetch is needed when the queue changes.
  const fetchCandidatePool = useCallback(async () => {
    try {
      setLoadingRecs(true);
      const curId = currentTrack?.id ? encodeURIComponent(currentTrack.id) : '';
      const [recsRes, libRes] = await Promise.all([
        fetch(apiUrl(`/api/tracks/recommendations?currentTrackId=${curId}`), { credentials: 'include' }),
        fetch(apiUrl('/api/tracks'), { credentials: 'include' })
      ]);

      let recTracks = [];
      if (recsRes.ok) {
        const recData = await recsRes.json();
        recTracks = recData.recommendations || recData.tracks || [];
      }
      let libraryTracks = [];
      if (libRes.ok) {
        const libData = await libRes.json();
        libraryTracks = libData.tracks || [];
      }

      // Recommendations first (personalized), then library as fallback.
      const seen = new Set();
      const pool = [];
      for (const t of [...recTracks, ...libraryTracks]) {
        if (!t || !t.id) continue;
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        pool.push(t);
      }
      setCandidatePool(pool);
    } catch (err) {
      console.error('Error fetching queue recommendations:', err);
    } finally {
      setLoadingRecs(false);
    }
  }, [currentTrack?.id]);

  // Reload the candidate pool when the sheet opens or the current track changes
  // (so personalization follows the currently playing song). This is the only
  // network call for recommendations.
  useEffect(() => {
    if (isQueueOpen) {
      fetchCandidatePool();
    }
  }, [isQueueOpen, fetchCandidatePool]);

  // Recalculate the filtered recommendations on every queue state change so the
  // list stays in sync without a refresh, reopen, or extra network request.
  useEffect(() => {
    if (!isQueueOpen) return;
    setRecommendations(buildRecommendations(candidatePool, queue, currentTrack));
  }, [isQueueOpen, candidatePool, queue, currentTrack, buildRecommendations]);

  if (!isQueueOpen) return null;

  const currentIdx = queue.findIndex((t) => t.id === currentTrack?.id);
  const upNextList = currentIdx !== -1 ? queue.slice(currentIdx + 1) : queue;

  return (
    <BottomSheet onClose={closeQueue} maxHeight="85vh">
      <div className="sheet-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h2 className="sheet-title">Playing Queue</h2>
          <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '12px', color: 'var(--text-secondary)' }}>
            {queue.length} tracks
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {queue.length > 1 && (
            <button
              onClick={clearQueue}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '0.25rem 0.65rem',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              Clear Queue
            </button>
          )}
          <button className="sheet-close-btn" onClick={closeQueue}>✕</button>
        </div>
      </div>

      <div className="sheet-scroll-container" style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
        {/* Currently Playing Card */}
        {currentTrack && (
          <div style={{ marginBottom: '1.25rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', marginBottom: '0.5rem', display: 'block' }}>
              Now Playing
            </span>
            <div className="quick-pick-row active" style={{ padding: '0.6rem 0.75rem' }}>
              <div className="row-main-info">
                {currentTrack.cover_art_path ? (
                  <img
                    src={apiUrl(`/api/tracks/${currentTrack.id}/art`)}
                    alt={currentTrack.title}
                    className="row-art"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="row-art-fallback">
                    <IconMusic size={22} color="var(--accent-primary)" />
                  </div>
                )}
                <div className="row-text">
                  <span className="row-title">{currentTrack.title}</span>
                  <span className="row-artist">{currentTrack.artist}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Up Next List */}
        <div style={{ marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>
            Up Next ({upNextList.length})
          </span>

          {upNextList.length > 0 ? (
            <div className="quick-picks-list">
              {upNextList.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  className="quick-pick-row"
                  onClick={() => playTrack(track, queue)}
                >
                  <div className="row-main-info">
                    <img
                      src={getArtworkUrl(track, 128)}
                      alt={track.title}
                      className="row-art"
                      onError={(e) => { e.target.src = logo; }}
                    />
                    <div className="row-text">
                      <span className="row-title">{track.title}</span>
                      <span className="row-artist">{track.artist}</span>
                    </div>
                  </div>

                  <button
                    className="row-more-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromQueue(currentIdx + 1 + idx);
                    }}
                    title="Remove from queue"
                  >
                    <IconTrash size={18} color="var(--text-muted)" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '12px' }}>
              No more songs in queue. Add songs below!
            </div>
          )}
        </div>

        {/* Queue Recommended Section with + Icon Button */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-primary)', display: 'block' }}>
              Recommended to Add to Queue
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Personalized</span>
          </div>

          {loadingRecs ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.5rem 0' }}>Loading recommendations...</div>
          ) : recommendations.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '0.5rem 0' }}>All recommended tracks are in your queue!</div>
          ) : (
            <div className="quick-picks-list">
              {recommendations.map((track) => (
                <div key={track.id} className="quick-pick-row" style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: '10px', padding: '0.5rem 0.75rem' }}>
                  <div className="row-main-info" onClick={() => playTrack(track, [...queue, track])} style={{ cursor: 'pointer' }}>
                    {track.cover_art_path ? (
                      <img
                        src={apiUrl(`/api/tracks/${track.id}/art`)}
                        alt={track.title}
                        className="row-art"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="row-art-fallback">
                        <IconMusic size={20} color="var(--text-secondary)" />
                      </div>
                    )}
                    <div className="row-text">
                      <span className="row-title">{track.title}</span>
                      <span className="row-artist">{track.artist}</span>
                    </div>
                  </div>

                  <button
                    className="add-to-queue-plus-btn"
                    style={{
                      background: 'rgba(245, 158, 11, 0.18)',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: 'var(--accent-primary)',
                      borderRadius: '50%',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'transform 0.15s ease, background 0.15s ease'
                    }}
                    onClick={() => addToQueue(track)}
                    title="Add to queue"
                  >
                    <IconPlus size={18} color="var(--accent-primary)" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
