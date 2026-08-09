import { useState, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import AddToPlaylistModal from './AddToPlaylistModal';
import {
  IconChevronDown,
  IconHeart,
  IconPlay,
  IconPause,
  IconSkipBack,
  IconSkipForward,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconMusic,
  IconMoreVertical,
  IconQueue,
  IconPlus,
  IconListPlus
} from './Icons';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function NowPlayingModal() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    favoritesMap,
    isShuffled,
    isRepeating,
    repeatMode,
    isNowPlayingOpen,
    closeNowPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTrack,
    toggleFavorite,
    toggleShuffle,
    toggleRepeat,
    addToQueue,
    openQueue
  } = usePlayer();

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const overlayRef = useRef(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);

  if (!isNowPlayingOpen || !currentTrack) return null;

  const isFav = !!favoritesMap[currentTrack.id];
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 2500);
  };

  const handleAddToQueue = () => {
    addToQueue(currentTrack);
    setIsActionSheetOpen(false);
    showToast(`Added "${currentTrack.title}" to Queue`);
  };

  const handleStart = (e) => {
    if (e.target.closest('button, input, a, range')) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    currentYRef.current = 0;
    isDraggingRef.current = true;
    if (overlayRef.current) {
      overlayRef.current.style.transition = 'none';
    }
  };

  const handleMove = (e) => {
    if (!isDraggingRef.current) return;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - startYRef.current;
    if (deltaY > 0) {
      currentYRef.current = deltaY;
      if (overlayRef.current) {
        overlayRef.current.style.transform = `translate3d(0, ${deltaY}px, 0)`;
      }
    }
  };

  const handleEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    if (overlayRef.current) {
      overlayRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      if (currentYRef.current > 120) {
        overlayRef.current.style.transform = 'translate3d(0, 100vh, 0)';
        setTimeout(() => {
          closeNowPlaying();
          if (overlayRef.current) overlayRef.current.style.transform = 'translate3d(0, 0, 0)';
        }, 180);
      } else {
        overlayRef.current.style.transform = 'translate3d(0, 0, 0)';
      }
    }
  };

  return (
    <>
      <div
        ref={overlayRef}
        className="now-playing-overlay"
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
      >
        {/* Background Ambient Blur */}
        {currentTrack.cover_art_path && (
          <div
            className="now-playing-bg-blur"
            style={{ backgroundImage: `url(/api/tracks/${currentTrack.id}/art)` }}
          />
        )}
        <div className="now-playing-gradient-overlay" />

        {/* Toast Notification */}
        {toastMessage && (
          <div
            style={{
              position: 'absolute',
              top: '70px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 600,
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

        {/* Main Container */}
        <div className="now-playing-content">
          {/* Top Header */}
          <div className="now-playing-header">
            <button className="header-icon-btn" onClick={closeNowPlaying} title="Minimize">
              <IconChevronDown size={28} color="#ffffff" />
            </button>
            <div className="now-playing-header-title">
              <span className="header-subtitle">PLAYING FROM LIBRARY</span>
              <span className="header-album">{currentTrack.album || 'LocalTune Stream'}</span>
            </div>
            <button
              className="header-icon-btn"
              onClick={() => setIsActionSheetOpen(true)}
              title="More Options"
            >
              <IconMoreVertical size={24} color="#ffffff" />
            </button>
          </div>

          {/* Centered Main Player Block */}
          <div className="now-playing-center-group">
            {/* Big Artwork Box */}
            <div className="now-playing-art-container">
              {currentTrack.cover_art_path ? (
                <img
                  src={`/api/tracks/${currentTrack.id}/art`}
                  alt={currentTrack.title}
                  className="now-playing-art-img"
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <div className="now-playing-art-fallback">
                  <IconMusic size={80} color="var(--accent-primary)" />
                </div>
              )}
            </div>

            {/* Controls & Scrub Section Directly Below Artwork */}
            <div className="now-playing-controls-block">
              {/* Track Info & Favorite Heart */}
              <div className="now-playing-meta-row">
                <div className="meta-text-group">
                  <h1 className="meta-title">{currentTrack.title}</h1>
                  <p className="meta-artist">{currentTrack.artist}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <button
                    className="header-icon-btn"
                    onClick={() => openQueue()}
                    title="View Queue"
                  >
                    <IconQueue size={22} color="var(--text-secondary)" />
                  </button>
                  <button
                    className={`meta-fav-btn ${isFav ? 'is-fav' : ''}`}
                    onClick={() => toggleFavorite(currentTrack.id)}
                    title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
                  >
                    <IconHeart
                      size={26}
                      color={isFav ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'}
                      fill={isFav ? 'var(--accent-primary)' : 'none'}
                    />
                  </button>
                </div>
              </div>

              {/* Interactive Scrub Bar */}
              <div className="now-playing-scrub-group">
                <div className="scrub-slider-wrapper">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime || 0}
                    onChange={(e) => seekTrack(Number(e.target.value))}
                    className="now-playing-scrub-input"
                    style={{
                      background: `linear-gradient(to right, var(--accent-primary) ${progressPercent}%, rgba(255, 255, 255, 0.15) ${progressPercent}%)`
                    }}
                  />
                </div>
                <div className="scrub-time-row">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Playback Controls */}
              <div className="now-playing-controls-row">
                <button
                  className="control-secondary-btn"
                  onClick={toggleShuffle}
                  title={isShuffled ? 'Shuffle On' : 'Shuffle Off'}
                >
                  <IconShuffle
                    size={22}
                    color={isShuffled ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'}
                  />
                </button>

                <button className="control-secondary-btn" onClick={prevTrack} title="Previous">
                  <IconSkipBack size={26} color="#ffffff" />
                </button>

                <button className="control-main-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying ? (
                    <IconPause size={30} color="#000000" fill="#000000" />
                  ) : (
                    <IconPlay size={30} color="#000000" fill="#000000" style={{ marginLeft: '3px' }} />
                  )}
                </button>

                <button className="control-secondary-btn" onClick={nextTrack} title="Next">
                  <IconSkipForward size={26} color="#ffffff" />
                </button>

                <button
                  className="control-secondary-btn"
                  onClick={toggleRepeat}
                  title={
                    repeatMode === 'one'
                      ? 'Repeat 1 (Current Song)'
                      : repeatMode === 'all'
                      ? 'Repeat All'
                      : 'Repeat Off'
                  }
                >
                  {repeatMode === 'one' ? (
                    <IconRepeatOne size={22} color="var(--accent-primary)" />
                  ) : (
                    <IconRepeat
                      size={22}
                      color={repeatMode === 'all' ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.6)'}
                    />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3-Dots Now Playing Options Action Sheet */}
      {isActionSheetOpen && (
        <div className="mobile-modal-overlay" onClick={() => setIsActionSheetOpen(false)}>
          <div className="mobile-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />

            <div className="action-sheet-track-header">
              {currentTrack.cover_art_path ? (
                <img
                  src={`/api/tracks/${currentTrack.id}/art`}
                  alt={currentTrack.title}
                  className="action-sheet-art"
                />
              ) : (
                <div className="action-sheet-art-fallback">
                  <IconMusic size={22} color="var(--accent-primary)" />
                </div>
              )}
              <div className="action-sheet-text">
                <span className="action-sheet-title">{currentTrack.title}</span>
                <span className="action-sheet-artist">{currentTrack.artist}</span>
              </div>
            </div>

            <div className="action-sheet-options">
              <button
                className="action-sheet-btn"
                onClick={() => {
                  setIsActionSheetOpen(false);
                  setIsAddToPlaylistOpen(true);
                }}
              >
                <IconListPlus size={20} color="var(--accent-primary)" />
                <span>1. Add to Playlist</span>
              </button>

              <button className="action-sheet-btn" onClick={handleAddToQueue}>
                <IconPlus size={20} color="var(--accent-primary)" />
                <span>2. Add to Queue</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add To Playlist Modal */}
      {isAddToPlaylistOpen && (
        <AddToPlaylistModal
          track={currentTrack}
          onClose={() => setIsAddToPlaylistOpen(false)}
        />
      )}
    </>
  );
}
