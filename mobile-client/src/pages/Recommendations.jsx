import React, { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import EditMetadataModal from '../components/EditMetadataModal';
import BulkEditModal from '../components/BulkEditModal';
import DebugScoreModal from '../components/DebugScoreModal';
import { logRecommendationAction } from '../services/recommendationTelemetry';
import {
  IconPlay,
  IconPause,
  IconHeart,
  IconEdit,
  IconBug,
  IconRefresh,
  IconChecklist,
  IconSparkles,
  IconPlus
} from '../components/Icons';
import { apiUrl } from '../config';

export default function Recommendations() {
  const { currentTrack, isPlaying, playTrack, togglePlay, favoritesMap, toggleFavorite, addToQueue } = usePlayer();

  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [editingTrack, setEditingTrack] = useState(null);
  const [debugTrack, setDebugTrack] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [rescanning, setRescanning] = useState(false);

  const fetchShelves = async () => {
    try {
      setLoading(true);
      setError(null);
      const curId = currentTrack ? currentTrack.id : '';
      const res = await fetch(apiUrl(`/api/tracks/recommendations/shelves?currentTrackId=${curId}`), {
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch recommendation shelves');
      setShelves(data.shelves || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShelves();
  }, [currentTrack?.id]);

  const handleRescanMissing = async () => {
    try {
      setRescanning(true);
      const res = await fetch(apiUrl('/api/tracks/scan-missing-metadata'), {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Rescanned missing metadata! Updated ${data.updatedCount || 0} tracks.`);
        fetchShelves();
      }
    } catch (e) {
      alert('Rescan missing metadata failed: ' + e.message);
    } finally {
      setRescanning(false);
    }
  };

  const toggleSelectTrack = (id) => {
    setSelectedTrackIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <div style={{ padding: '16px 16px 100px 16px', color: '#fff' }}>
      {/* Header Bar */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconSparkles size={24} color="#6366f1" /> Recommendations
        </h1>
        <p style={{ margin: '4px 0 14px 0', color: 'rgba(255,255,255,0.6)', fontSize: '13px' }}>
          Smart offline mixes tuned to your listening taste.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRescanMissing}
            disabled={rescanning}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <IconRefresh size={16} /> Rescan Genres
          </button>

          <button
            type="button"
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedTrackIds([]);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '10px',
              background: bulkMode ? '#6366f1' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <IconChecklist size={16} /> {bulkMode ? 'Cancel' : 'Bulk Edit'}
          </button>

          {bulkMode && selectedTrackIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                background: '#10b981',
                border: 'none',
                color: '#fff',
                fontWeight: '600',
                fontSize: '12px'
              }}
            >
              Edit {selectedTrackIds.length} Songs
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>Loading recommendations...</div>
      ) : error ? (
        <div style={{ padding: '16px', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '12px' }}>
          {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
          {shelves.map((shelf) => {
            if (!shelf.tracks || shelf.tracks.length === 0) return null;

            return (
              <div key={shelf.id}>
                <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: '#fff' }}>
                  {shelf.title}
                </h3>

                {/* Horizontal Scroll Shelf for Mobile */}
                <div
                  style={{
                    display: 'flex',
                    gap: '14px',
                    overflowX: 'auto',
                    paddingBottom: '8px',
                    scrollSnapType: 'x mandatory'
                  }}
                >
                  {shelf.tracks.map((track, trackIndex) => {
                    const isCurrent = currentTrack && currentTrack.id === track.id;
                    const isSelected = selectedTrackIds.includes(track.id);

                    return (
                      <div
                        key={`${shelf.id}_${track.id}`}
                        style={{
                          flex: '0 0 160px',
                          scrollSnapAlign: 'start',
                          background: 'rgba(255,255,255,0.05)',
                          borderRadius: '14px',
                          border: isSelected ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                          padding: '10px',
                          position: 'relative'
                        }}
                      >
                        {bulkMode && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTrack(track.id)}
                            style={{
                              position: 'absolute',
                              top: '6px',
                              left: '6px',
                              zIndex: 10,
                              transform: 'scale(1.2)'
                            }}
                          />
                        )}

                        <div
                          style={{
                            width: '100%',
                            aspectRatio: '1',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            position: 'relative',
                            background: '#1a1a24',
                            marginBottom: '8px'
                          }}
                          onClick={() => {
                            if (isCurrent) togglePlay();
                            else {
                              logRecommendationAction(track.id, 'played', {
                                shelfId: shelf.id,
                                source: 'shelf',
                                surface: shelf.id,
                                currentTrackId: currentTrack ? currentTrack.id : null,
                                positionInQueue: trackIndex
                              });
                              playTrack(track, shelf.tracks);
                            }
                          }}
                        >
                          <img
                            src={apiUrl(`/api/tracks/${track.id}/art`)}
                            alt={track.title}
                            onError={(e) => { e.target.style.display = 'none'; }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <button
                            style={{
                              position: 'absolute',
                              bottom: '8px',
                              right: '8px',
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: '#6366f1',
                              border: 'none',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {isCurrent && isPlaying ? <IconPause size={18} /> : <IconPlay size={18} />}
                          </button>
                        </div>

                        <div style={{ fontSize: '13px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {track.title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {track.artist}
                        </div>

                        {track.genre && (
                          <div style={{ marginTop: '4px' }}>
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>
                              {track.genre}
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <button onClick={() => toggleFavorite(track.id)} style={{ background: 'none', border: 'none', color: favoritesMap[track.id] ? '#ef4444' : '#aaa' }}>
                            {favoritesMap[track.id] ? <IconHeart size={16} color="#ef4444" fill="#ef4444" /> : <IconHeart size={16} />}
                          </button>
                          <button onClick={() => setEditingTrack(track)} style={{ background: 'none', border: 'none', color: '#aaa' }}>
                            <IconEdit size={16} />
                          </button>
                          <button onClick={() => setDebugTrack(track)} style={{ background: 'none', border: 'none', color: '#6366f1' }}>
                            <IconBug size={16} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingTrack && (
        <EditMetadataModal
          track={editingTrack}
          onClose={() => setEditingTrack(null)}
          onSave={() => fetchShelves()}
        />
      )}

      {debugTrack && (
        <DebugScoreModal
          track={debugTrack}
          onClose={() => setDebugTrack(null)}
        />
      )}

      {showBulkModal && (
        <BulkEditModal
          selectedTrackIds={selectedTrackIds}
          onClose={() => setShowBulkModal(false)}
          onSave={() => {
            setSelectedTrackIds([]);
            setBulkMode(false);
            fetchShelves();
          }}
        />
      )}
    </div>
  );
}
