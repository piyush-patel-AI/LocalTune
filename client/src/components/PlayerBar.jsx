import { useState } from 'react';
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
  IconPlus
} from './Icons';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function PlayerBar({ showQueue, setShowQueue }) {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    shuffle,
    repeat,
    favoritesMap,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    setShuffle,
    setRepeat,
    toggleFavorite,
    addToQueue
  } = usePlayer();

  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const isFav = currentTrack ? !!favoritesMap[currentTrack.id] : false;
  const displayTime = isDragging ? dragTime : currentTime;
  const progressPercent = duration ? (displayTime / duration) * 100 : 0;

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
    <div className="player-bar">
      {/* Left: Track Details & Animated VU Meter & Format Badge */}
      <div className="player-left">
        {currentTrack && currentTrack.cover_art_path ? (
          <img
            src={`/api/tracks/${currentTrack.id}/art`}
            alt={currentTrack.title}
            className="player-track-art"
            style={{ objectFit: 'cover' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="player-track-art">
            <IconMusic size={22} color="var(--accent-primary)" />
          </div>
        )}
        <div className="player-track-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isPlaying && (
              <div className="vu-equalizer" title="Audio Output Active">
                <span />
                <span />
                <span />
              </div>
            )}
            <div className="player-track-title">
              {currentTrack ? currentTrack.title : 'Nothing is playing'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
            <div className="player-track-artist">
              {currentTrack ? currentTrack.artist : 'Select a track to start listening'}
            </div>
            {currentTrack && (currentTrack.artist.includes('feat.') || currentTrack.artist.includes('ft.') || currentTrack.artist.includes('&')) && (
              <span className="collab-badge" title="Collaboration Track">🤝 Collab</span>
            )}
            {currentTrack && currentTrack.format && (
              <span className="format-badge">{currentTrack.format.toUpperCase()}</span>
            )}
          </div>
        </div>
        <div className="player-track-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', position: 'relative' }}>
          <button
            className={`fav-toggle-btn ${isFav ? 'is-fav' : ''}`}
            onClick={() => currentTrack && toggleFavorite(currentTrack.id)}
            disabled={!currentTrack}
            title={currentTrack ? (isFav ? 'Remove from favorites' : 'Add to favorites') : 'No active track'}
            style={{ opacity: currentTrack ? 1 : 0.4 }}
          >
            <IconHeart
              size={18}
              color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
              fill={isFav ? 'var(--accent-crimson)' : 'none'}
            />
          </button>

          <div style={{ position: 'relative' }}>
            <button
              className="player-add-btn"
              onClick={() => currentTrack && setShowAddMenu(!showAddMenu)}
              disabled={!currentTrack}
              title={currentTrack ? "Add track to Playlist or Queue" : "No active track"}
              style={{ opacity: currentTrack ? 1 : 0.4 }}
            >
              <IconPlus size={18} color={showAddMenu ? 'var(--accent-primary)' : 'var(--text-muted)'} />
            </button>

            {showAddMenu && currentTrack && (
              <>
                <div className="popover-backdrop" onClick={() => setShowAddMenu(false)} />
                <div className="player-add-popover">
                  <button
                    className="player-popover-item"
                    onClick={() => {
                      addToQueue(currentTrack);
                      setShowAddMenu(false);
                      setToastMsg('Added to Queue!');
                      setTimeout(() => setToastMsg(''), 2000);
                    }}
                  >
                    <IconQueue size={15} color="var(--accent-primary)" />
                    <span>Add to Queue</span>
                  </button>
                  <button
                    className="player-popover-item"
                    onClick={() => {
                      setShowAddMenu(false);
                      setShowPlaylistModal(true);
                    }}
                  >
                    <IconPlus size={15} color="var(--accent-primary)" />
                    <span>Add to Playlist...</span>
                  </button>
                </div>
              </>
            )}
            {toastMsg && <div className="player-toast-popup">{toastMsg}</div>}
          </div>
        </div>
      </div>

      {showPlaylistModal && currentTrack && (
        <AddToPlaylistModal
          track={currentTrack}
          onClose={() => setShowPlaylistModal(false)}
        />
      )}

      {/* Center: Transport & Progress Scrub Bar */}
      <div className="player-center">
        <div className="player-controls">
          <button
            className={`control-btn ${shuffle ? 'active' : ''}`}
            onClick={setShuffle}
            title="Shuffle"
          >
            <IconShuffle size={18} color={shuffle ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
          </button>

          <button className="control-btn" onClick={prevTrack} disabled={!currentTrack} title="Previous">
            <IconSkipBack size={18} />
          </button>

          <button className="play-main-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
            {isPlaying ? (
              <IconPause size={18} color="#111" fill="#111" />
            ) : (
              <IconPlay size={18} color="#111" fill="#111" style={{ marginLeft: '2px' }} />
            )}
          </button>

          <button className="control-btn" onClick={nextTrack} disabled={!currentTrack} title="Next">
            <IconSkipForward size={18} />
          </button>

          <button
            className={`control-btn ${repeat !== 'off' ? 'active' : ''}`}
            onClick={cycleRepeat}
            title={`Repeat: ${repeat}`}
          >
            {repeat === 'one' ? (
              <IconRepeatOne size={18} color="var(--accent-primary)" />
            ) : (
              <IconRepeat size={18} color={repeat === 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
            )}
          </button>
        </div>

        <div className="scrub-container">
          <span className="time-stamp">{formatTime(displayTime)}</span>
          <div className="scrub-bar-wrapper">
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
              className="scrub-slider"
              style={{
                background: `linear-gradient(to right, var(--accent-primary) 0%, #fbbf24 ${progressPercent}%, rgba(255, 255, 255, 0.14) ${progressPercent}%, rgba(255, 255, 255, 0.14) 100%)`
              }}
            />
          </div>
          <span className="time-stamp">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right: Volume & Queue Panel Toggle */}
      <div className="player-right">
        <div className="volume-container">
          <IconVolume size={18} color="var(--text-muted)" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="volume-slider"
          />
        </div>

        <button
          className={`control-btn ${showQueue ? 'active' : ''}`}
          onClick={() => setShowQueue(!showQueue)}
          title="Play Queue"
        >
          <IconQueue size={18} color={showQueue ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
        </button>
      </div>
    </div>
  );
}
