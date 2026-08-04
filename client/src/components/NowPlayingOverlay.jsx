import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import AddToPlaylistModal from './AddToPlaylistModal';
import {
  IconMusic,
  IconPlay,
  IconPause,
  IconSkipBack,
  IconSkipForward,
  IconShuffle,
  IconRepeat,
  IconRepeatOne,
  IconVolume,
  IconQueue,
  IconHeart,
  IconPlus,
  IconChevronDown,
  IconClose
} from './Icons';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function NowPlayingOverlay({ onClose }) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    shuffle,
    repeat,
    queue,
    queueIndex,
    favoritesMap,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    setShuffle,
    setRepeat,
    toggleFavorite,
    addToQueue,
    playTrack
  } = usePlayer();

  const [isClosing, setIsClosing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const isFav = currentTrack ? !!favoritesMap[currentTrack.id] : false;
  const displayTime = isDragging ? dragTime : currentTime;
  const progressPercent = duration ? (displayTime / duration) * 100 : 0;

  // Handle smooth closing animation
  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 280);
  };

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSeekChange = (e) => {
    setDragTime(parseFloat(e.target.value));
  };

  const handleSeekMouseDown = () => {
    setIsDragging(true);
    setDragTime(currentTime);
  };

  const handleSeekMouseUp = (e) => {
    const newTime = parseFloat(e.target.value);
    setIsDragging(false);
    seek(newTime);
  };

  const cycleRepeat = () => {
    if (repeat === 'off') setRepeat('all');
    else if (repeat === 'all') setRepeat('one');
    else setRepeat('off');
  };

  return (
    <div className={`np-overlay-container ${isClosing ? 'is-closing' : ''}`}>
      {/* Blurred Dynamic Background Layer */}
      <div className="np-background-blur">
        {currentTrack && currentTrack.cover_art_path ? (
          <img
            src={`/api/tracks/${currentTrack.id}/art`}
            alt=""
            className="np-bg-image"
          />
        ) : (
          <div className="np-bg-fallback" />
        )}
        <div className="np-bg-overlay" />
      </div>

      {/* Top Header Navigation */}
      <header className="np-header">
        <button className="np-close-btn" onClick={handleClose} title="Close Overlay (Esc)">
          <IconChevronDown size={28} color="var(--text-primary)" />
        </button>
        <div className="np-header-title">
          <span className="np-header-label">PLAYING FROM</span>
          <span className="np-header-source">LocalTune Library</span>
        </div>
        <button className="np-close-btn-secondary" onClick={handleClose} title="Close (Esc)">
          <IconClose size={20} color="var(--text-muted)" />
        </button>
      </header>

      {/* Main 70% / 30% Split Layout */}
      <main className="np-content-layout">
        {/* Left Section (70%): Album Art, Track Meta & Transport */}
        <section className="np-left-section">
          {/* Large Album Artwork */}
          <div className="np-artwork-wrapper">
            {currentTrack && currentTrack.cover_art_path ? (
              <img
                src={`/api/tracks/${currentTrack.id}/art`}
                alt={currentTrack ? currentTrack.title : 'Album Cover'}
                className="np-large-artwork"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="np-large-artwork-fallback">
                <IconMusic size={80} color="var(--accent-primary)" />
              </div>
            )}
          </div>

          {/* Song Info */}
          <div className="np-track-details">
            <div className="np-title-row">
              <h1 className="np-track-title">{currentTrack ? currentTrack.title : 'Nothing is playing'}</h1>
              {currentTrack && (
                <button
                  className={`np-fav-btn ${isFav ? 'is-fav' : ''}`}
                  onClick={() => toggleFavorite(currentTrack.id)}
                  title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <IconHeart
                    size={24}
                    color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
                    fill={isFav ? 'var(--accent-crimson)' : 'none'}
                  />
                </button>
              )}
            </div>

            <div className="np-artist-album-row">
              <span className="np-artist-name">{currentTrack ? currentTrack.artist : 'Select a track to start'}</span>
              {currentTrack && currentTrack.album && (
                <>
                  <span className="np-dot-separator">•</span>
                  <span className="np-album-name">{currentTrack.album}</span>
                </>
              )}
              {currentTrack && currentTrack.year && (
                <>
                  <span className="np-dot-separator">•</span>
                  <span className="np-year-badge">{currentTrack.year}</span>
                </>
              )}
              {currentTrack && (currentTrack.artist.includes('feat.') || currentTrack.artist.includes('ft.') || currentTrack.artist.includes('&')) && (
                <span className="collab-badge" title="Collaboration Track" style={{ marginLeft: '0.4rem' }}>🤝 Collab</span>
              )}
              {currentTrack && currentTrack.format && (
                <span className="format-badge" style={{ marginLeft: '0.4rem' }}>{currentTrack.format.toUpperCase()}</span>
              )}
            </div>
          </div>

          {/* Scrub Bar */}
          <div className="np-scrub-section">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={displayTime}
              onChange={handleSeekChange}
              onMouseDown={handleSeekMouseDown}
              onMouseUp={handleSeekMouseUp}
              onTouchStart={handleSeekMouseDown}
              onTouchEnd={handleSeekMouseUp}
              disabled={!currentTrack || !duration}
              className="np-scrub-slider"
              style={{
                background: `linear-gradient(to right, var(--accent-primary) 0%, #fbbf24 ${progressPercent}%, rgba(255, 255, 255, 0.15) ${progressPercent}%, rgba(255, 255, 255, 0.15) 100%)`
              }}
            />
            <div className="np-time-labels">
              <span>{formatTime(displayTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="np-controls-bar">
            <button
              className={`np-control-btn ${shuffle ? 'active' : ''}`}
              onClick={setShuffle}
              title="Shuffle"
            >
              <IconShuffle size={22} color={shuffle ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
            </button>

            <button className="np-control-btn" onClick={prevTrack} disabled={!currentTrack} title="Previous">
              <IconSkipBack size={24} />
            </button>

            <button className="np-play-main-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <IconPause size={24} color="#111" fill="#111" />
              ) : (
                <IconPlay size={24} color="#111" fill="#111" style={{ marginLeft: '2px' }} />
              )}
            </button>

            <button className="np-control-btn" onClick={nextTrack} disabled={!currentTrack} title="Next">
              <IconSkipForward size={24} />
            </button>

            <button
              className={`np-control-btn ${repeat !== 'off' ? 'active' : ''}`}
              onClick={cycleRepeat}
              title={`Repeat: ${repeat}`}
            >
              {repeat === 'one' ? (
                <IconRepeatOne size={22} color="var(--accent-primary)" />
              ) : (
                <IconRepeat size={22} color={repeat === 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
              )}
            </button>
          </div>
        </section>

        {/* Right Section (30%): Queue Panel */}
        <section className="np-right-section">
          <div className="np-queue-card">
            <div className="np-queue-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <IconQueue size={20} color="var(--accent-primary)" />
                <h2 className="np-queue-title">Queue</h2>
              </div>
              <span className="np-queue-count">{queue.length} Tracks</span>
            </div>
            <div className="np-queue-subtitle">Playing From LocalTune Library</div>

            <div className="np-queue-scrollable">
              {queue.length === 0 ? (
                <div className="np-empty-queue">
                  <IconMusic size={36} color="var(--text-muted)" />
                  <p>Queue is empty</p>
                </div>
              ) : (
                queue.map((track, idx) => {
                  const isCurrent = idx === queueIndex;
                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      className={`np-queue-item ${isCurrent ? 'is-playing' : ''}`}
                      onClick={() => playTrack(track)}
                    >
                      <div className="np-queue-art-wrapper">
                        {track.cover_art_path ? (
                          <img
                            src={`/api/tracks/${track.id}/art`}
                            alt={track.title}
                            className="np-queue-art"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="np-queue-art-fallback">
                            <IconMusic size={16} color="var(--accent-primary)" />
                          </div>
                        )}
                        {isCurrent && isPlaying && (
                          <div className="np-queue-equalizer">
                            <span />
                            <span />
                            <span />
                          </div>
                        )}
                      </div>

                      <div className="np-queue-meta">
                        <div className="np-queue-song-title">{track.title}</div>
                        <div className="np-queue-artist">{track.artist}</div>
                      </div>

                      <span className="np-queue-duration">{formatTime(track.duration_seconds)}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </main>

      {showPlaylistModal && currentTrack && (
        <AddToPlaylistModal
          track={currentTrack}
          onClose={() => setShowPlaylistModal(false)}
        />
      )}
    </div>
  );
}
