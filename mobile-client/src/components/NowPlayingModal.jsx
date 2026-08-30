import { useState, useRef, useCallback, useEffect, useLayoutEffect, memo } from 'react';
import { flushSync } from 'react-dom';
import logo from '../../../Assets/logo.png';
import { usePlayer } from '../context/PlayerContext';
import { getArtworkUrl } from '../services/MediaMetadataProvider';
import AddToPlaylistModal from './AddToPlaylistModal';
import { apiUrl } from '../config';
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

const ArtSlide = memo(function ArtSlide({ track }) {
  if (!track) {
    return <div className="art-slide-empty" />;
  }
  if (track.cover_art_path) {
    return (
      <img
        src={getArtworkUrl(track, 512)}
        alt={track.title}
        className="art-slide-img"
        draggable={false}
        loading="eager"
        decoding="async"
        onError={(e) => { e.target.src = logo; }}
      />
    );
  }
  return (
    <div className="art-slide-fallback">
      <IconMusic size={80} color="var(--accent-primary)" />
    </div>
  );
});

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
    queue,
    isNowPlayingOpen,
    closeNowPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTrack,
    toggleFavorite,
    toggleShuffle,
    toggleRepeat,
    openQueue
  } = usePlayer();

  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [isAddToPlaylistOpen, setIsAddToPlaylistOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const overlayRef = useRef(null);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Album art carousel refs
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const artDragRef = useRef({ active: false, startX: 0, startY: 0, dx: 0, decided: false, swiping: false });

  // Horizontal gap (px) between neighboring art slides; must be accounted for
  // in every track offset so centering and snap positions stay exact.
  const GAP = 12;
  const getStep = () => (viewportRef.current?.clientWidth || 0) + GAP;

  // --- Carousel: resolve prev/next tracks from queue ---
  const queueIndex = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
  const prevTrackItem = queueIndex > 0 ? queue[queueIndex - 1] : null;
  const nextTrackItem = queueIndex >= 0 && queueIndex < queue.length - 1 ? queue[queueIndex + 1] : null;

  // --- Carousel: reset track position after track change (non-animated, seamless) ---
  useLayoutEffect(() => {
    if (trackRef.current) {
      const step = getStep();
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translate3d(${-step}px, 0, 0)`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack?.id]);

  // --- Preload neighbor artwork so both cards are rendered before the gesture ---
  useEffect(() => {
    const neighbors = [];
    if (prevTrackItem?.cover_art_path) neighbors.push(prevTrackItem);
    if (nextTrackItem?.cover_art_path) neighbors.push(nextTrackItem);
    neighbors.forEach((t) => {
      const img = new Image();
      img.src = getArtworkUrl(t, 512);
    });
  }, [prevTrackItem?.id, nextTrackItem?.id, prevTrackItem, nextTrackItem]);

  // --- Art swipe gesture handlers ---
  const handleArtStart = useCallback((e) => {
    if (e.target.closest('button, input, a')) return;
    e.stopPropagation();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    artDragRef.current = { active: true, startX: clientX, startY: clientY, dx: 0, decided: false, swiping: true };
    if (trackRef.current) trackRef.current.style.transition = 'none';
  }, []);

  const handleArtMove = useCallback((e) => {
    if (!artDragRef.current.active) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - artDragRef.current.startX;
    const dy = clientY - artDragRef.current.startY;

    if (!artDragRef.current.decided) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        artDragRef.current.decided = true;
      } else if (Math.abs(dy) > 10) {
        artDragRef.current.active = false;
        artDragRef.current.swiping = false;
        return;
      }
      return;
    }

    e.preventDefault();
    artDragRef.current.dx = dx;

    // Apply resistance at boundaries
    let effectiveDx = dx;
    if (dx < 0 && !nextTrackItem) effectiveDx = dx * 0.25;
    else if (dx > 0 && !prevTrackItem) effectiveDx = dx * 0.25;

    if (trackRef.current) {
      const step = getStep();
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translate3d(${-step + effectiveDx}px, 0, 0)`;
    }
  }, [prevTrackItem, nextTrackItem]);

  const handleArtEnd = useCallback(() => {
    if (!artDragRef.current.active) return;
    artDragRef.current.active = false;

    const dx = artDragRef.current.dx;
    const threshold = 60;

    if (artDragRef.current.decided && Math.abs(dx) > threshold) {
      const goNext = dx < 0 && !!nextTrackItem;
      const goPrev = dx > 0 && !!prevTrackItem;

      if (goNext || goPrev) {
        const step = getStep();
        const target = goNext ? -(2 * step) : 0;

        if (trackRef.current) {
          trackRef.current.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';
          trackRef.current.style.transform = `translate3d(${target}px, 0, 0)`;
        }

        setTimeout(() => {
          flushSync(() => {
            if (goNext) nextTrack();
            else prevTrack();
          });
          if (trackRef.current) {
            const resetStep = getStep();
            trackRef.current.style.transition = 'none';
            trackRef.current.style.transform = `translate3d(${-resetStep}px, 0, 0)`;
          }
          artDragRef.current.swiping = false;
        }, 220);
        return;
      }
    }

    // Snap back
    if (trackRef.current) {
      const step = getStep();
      trackRef.current.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      trackRef.current.style.transform = `translate3d(${-step}px, 0, 0)`;
    }
    artDragRef.current.swiping = false;
  }, [viewportRef, nextTrackItem, prevTrackItem, nextTrack, prevTrack]);

  // --- Overlay vertical swipe-to-dismiss ---
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

  if (!isNowPlayingOpen || !currentTrack) return null;

  const isFav = !!favoritesMap[currentTrack.id];
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

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
            style={{ backgroundImage: `url(${apiUrl(`/api/tracks/${currentTrack.id}/art`)})` }}
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
              <span className="header-album">{currentTrack.album || 'Octave Stream'}</span>
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
            {/* Artwork Carousel — viewport clips the track */}
            <div
              className="art-carousel-viewport"
              ref={viewportRef}
              onTouchStart={handleArtStart}
              onTouchMove={handleArtMove}
              onTouchEnd={handleArtEnd}
              onMouseDown={handleArtStart}
              onMouseMove={handleArtMove}
              onMouseUp={handleArtEnd}
              onMouseLeave={handleArtEnd}
            >
              <div className="art-carousel-track" ref={trackRef}>
                <ArtSlide key={`prev-${prevTrackItem?.id || 'none'}`} track={prevTrackItem} />
                <ArtSlide key={`cur-${currentTrack.id}`} track={currentTrack} />
                <ArtSlide key={`next-${nextTrackItem?.id || 'none'}`} track={nextTrackItem} />
              </div>
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
                      background: `linear-gradient(to right, #F5F5F5 ${progressPercent}%, rgba(255, 255, 255, 0.15) ${progressPercent}%)`
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
                  src={apiUrl(`/api/tracks/${currentTrack.id}/art`)}
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
                  toggleFavorite(currentTrack.id);
                  setIsActionSheetOpen(false);
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
                onClick={() => {
                  setIsActionSheetOpen(false);
                  setIsAddToPlaylistOpen(true);
                }}
              >
                <IconListPlus size={20} color="var(--accent-primary)" />
                <span>Add to Playlist</span>
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
