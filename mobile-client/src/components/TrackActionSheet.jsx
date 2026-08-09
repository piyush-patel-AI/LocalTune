import { useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { getArtworkUrl } from '../services/MediaMetadataProvider';
import AddToPlaylistModal from './AddToPlaylistModal';
import BottomSheet from './BottomSheet';
import { IconPlay, IconHeart, IconPlus, IconMusic } from './Icons';

export default function TrackActionSheet({ track, onClose }) {
  const { playTrack, toggleFavorite, favoritesMap } = usePlayer();
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

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
            onError={(e) => { e.target.src = '/logo.png'; }}
          />
          <div className="action-sheet-text">
            <span className="action-sheet-title">{track.title}</span>
            <span className="action-sheet-artist">{track.artist} • {track.album || 'LocalTune'}</span>
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
        </div>
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
