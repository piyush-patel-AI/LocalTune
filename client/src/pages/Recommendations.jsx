import React, { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import EditMetadataModal from '../components/EditMetadataModal';
import BulkEditModal from '../components/BulkEditModal';
import DebugScoreModal from '../components/DebugScoreModal';
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
      const res = await fetch(`/api/tracks/recommendations/shelves?currentTrackId=${curId}`, {
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
      const res = await fetch('/api/tracks/scan-missing-metadata', {
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
    <div style={{ padding: '32px 40px', maxWidth: '1400px', margin: '0 auto', color: '#fff' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <IconSparkles size={32} color="#6366f1" /> Smart Recommendations
          </h1>
          <p style={{ margin: '6px 0 0 0', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
            Powered by listening habits, genres, time-decay scoring, and transition learning.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleRescanMissing}
            disabled={rescanning}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px'
            }}
          >
            <IconRefresh size={18} className={rescanning ? 'spin' : ''} />
            {rescanning ? 'Scanning Tags...' : 'Rescan Missing Genres'}
          </button>

          <button
            type="button"
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedTrackIds([]);
            }}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              background: bulkMode ? '#6366f1' : 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px'
            }}
          >
            <IconChecklist size={18} />
            {bulkMode ? 'Cancel Selection' : 'Bulk Edit Metadata'}
          </button>

          {bulkMode && selectedTrackIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                background: '#10b981',
                border: 'none',
                color: '#fff',
                fontWeight: '600',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              Edit {selectedTrackIds.length} Tracks
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#aaa' }}>Loading recommendations...</div>
      ) : error ? (
        <div style={{ padding: '20px', background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#fca5a5', borderRadius: '12px' }}>
          {error}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '36px' }}>
          {shelves.map((shelf) => {
            if (!shelf.tracks || shelf.tracks.length === 0) return null;

            return (
              <div key={shelf.id}>
                <h2 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '16px', color: '#fff' }}>
                  {shelf.title}
                </h2>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '20px'
                  }}
                >
                  {shelf.tracks.map((track) => {
                    const isCurrent = currentTrack && currentTrack.id === track.id;
                    const isSelected = selectedTrackIds.includes(track.id);

                    return (
                      <div
                        key={`${shelf.id}_${track.id}`}
                        className="track-card glass-panel"
                        style={{
                          position: 'relative',
                          background: 'rgba(255,255,255,0.04)',
                          borderRadius: '14px',
                          border: isSelected ? '2px solid #6366f1' : '1px solid rgba(255,255,255,0.08)',
                          padding: '14px',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                      >
                        {/* Bulk Select Checkbox */}
                        {bulkMode && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTrack(track.id)}
                            style={{
                              position: 'absolute',
                              top: '10px',
                              left: '10px',
                              zIndex: 10,
                              transform: 'scale(1.3)',
                              cursor: 'pointer'
                            }}
                          />
                        )}

                        {/* Cover Art Container */}
                        <div
                          style={{
                            position: 'relative',
                            width: '100%',
                            aspectRatio: '1',
                            borderRadius: '10px',
                            overflow: 'hidden',
                            background: '#1a1a24',
                            marginBottom: '12px'
                          }}
                        >
                          <img
                            src={`/api/tracks/${track.id}/art`}
                            alt={track.title}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />

                          {/* Play Hover Overlay */}
                          <div
                            className="play-overlay"
                            onClick={() => {
                              if (isCurrent) togglePlay();
                              else playTrack(track, shelf.tracks);
                            }}
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'rgba(0,0,0,0.4)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer'
                            }}
                          >
                            <button
                              style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '50%',
                                background: '#6366f1',
                                border: 'none',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 8px 20px rgba(99,102,241,0.5)',
                                cursor: 'pointer'
                              }}
                            >
                              {isCurrent && isPlaying ? <IconPause size={22} /> : <IconPlay size={22} />}
                            </button>
                          </div>
                        </div>

                        {/* Track Info */}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {track.title}
                          </div>
                          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {track.artist}
                          </div>

                          {/* Genre Pill & Reason Tag */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                            {track.genre && (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '10px',
                                  background: 'rgba(99,102,241,0.2)',
                                  color: '#a5b4fc',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}
                              >
                                {track.genre}
                              </span>
                            )}
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '10px',
                                background: 'rgba(255,255,255,0.06)',
                                color: '#aaa',
                                fontSize: '11px'
                              }}
                            >
                              💡 {track.reason || 'Picked for you'}
                            </span>
                          </div>
                        </div>

                        {/* Action Icons Row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => toggleFavorite(track.id)}
                              style={{ background: 'none', border: 'none', color: favoritesMap[track.id] ? '#ef4444' : '#aaa', cursor: 'pointer' }}
                            >
                              {favoritesMap[track.id] ? (
                                <IconHeart size={18} color="#ef4444" fill="#ef4444" />
                              ) : (
                                <IconHeart size={18} />
                              )}
                            </button>
                            <button
                              onClick={() => addToQueue(track)}
                              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}
                              title="Add to queue"
                            >
                              <IconPlus size={18} />
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => setEditingTrack(track)}
                              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}
                              title="Edit Metadata"
                            >
                              <IconEdit size={18} />
                            </button>
                            <button
                              onClick={() => setDebugTrack(track)}
                              style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer' }}
                              title="Debug Score Breakdown"
                            >
                              <IconBug size={18} />
                            </button>
                          </div>
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

      {/* Modals */}
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
