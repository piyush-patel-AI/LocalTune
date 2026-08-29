import { useState, useRef } from 'react';
import logo from '../../../Assets/logo.png';
import { usePlayer } from '../context/PlayerContext';
import { getArtworkUrl } from '../services/MediaMetadataProvider';
import AddToPlaylistModal from './AddToPlaylistModal';
import BottomSheet from './BottomSheet';
import { IconPlay, IconHeart, IconPlus, IconMusic, IconQueue } from './Icons';

export default function TrackActionSheet({ track, onClose }) {
  const { playTrack, toggleFavorite, addToQueue, favoritesMap } = usePlayer();
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimerRef = useRef(null);

  const showToast = (msg) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => setToastMessage(''), 2500);
  };

  if (!track) return null;

  const isFav = !!favoritesMap[track.id];

  return (
    <>
      <BottomSheet onClose={onClose}>
        {/* Track Header */}
        <div className="action-sheet-track-header">
          <img
            src={getArtworkUrl(track, 256)}
            alt={track.title}
            className="action-sheet-art"
            onError={(e) => { e.target.src = logo; }}
          />
          <div className="action-sheet-text">
            <span className="action-sheet-title">{track.title}</span>
            <span className="action-sheet-artist">{track.artist} • {track.album || 'Octave'}</span>
          </div>
        </div>

        {/* Action List */}
        <div className="action-sheet-options">
          <button
            className="action-sheet-btn"
            onClick={() => {
              playTrack(track);
              onClose();
            }}
          >
            <IconPlay size={20} color="var(--accent-primary)" fill="var(--accent-primary)" />
            <span>Play Now</span>
          </button>

          <button
            className="action-sheet-btn"
            onClick={() => {
              toggleFavorite(track.id);
              onClose();
            }}
          >
            <IconHeart
              size={20}
              color={isFav ? 'var(--accent-primary)' : '#ffffff'}
              fill={isFav ? 'var(--accent-primary)' : 'none'}
            />
            <span>{isFav ? 'Remove from Liked Songs' : 'Save to Liked Songs'}</span>
          </button>

          <button
            className="action-sheet-btn"
            onClick={() => setShowPlaylistModal(true)}
          >
            <IconPlus size={20} color="#ffffff" />
            <span>Add to Playlist</span>
          </button>

          <button
            className="action-sheet-btn"
            onClick={() => {
              const wasAdded = addToQueue(track);
              if (wasAdded) {
                onClose();
              } else {
                showToast('Already in Queue');
              }
            }}
          >
            <IconQueue size={20} color="var(--accent-primary)" />
            <span>Add to Queue</span>
          </button>
        </div>

        {toastMessage && (
          <div
            style={{
              position: 'fixed',
              bottom: '100px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 700,
              background: 'rgba(245, 158, 11, 0.95)',
              color: '#000000',
              padding: '0.4rem 1rem',
              borderRadius: '20px',
              fontWeight: 800,
              fontSize: '0.8rem',
              boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
            }}
          >
            {toastMessage}
          </div>
        )}
      </BottomSheet>

      {showPlaylistModal && (
        <AddToPlaylistModal
          track={track}
          onClose={() => {
            setShowPlaylistModal(false);
            onClose();
          }}
        />
      )}
    </>
  );
}
