import { usePlayer } from '../context/PlayerContext';
import {
  IconClose,
  IconPlay,
  IconPause,
  IconMusic,
  IconChevronUp,
  IconChevronDown,
  IconShuffle
} from './Icons';

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function QueuePanel({ onClose }) {
  const {
    queue,
    queueIndex,
    currentTrack,
    isPlaying,
    playTrack,
    removeFromQueue,
    reorderQueue,
    shuffleQueue,
    shuffle
  } = usePlayer();

  const moveUp = (idx) => {
    if (idx <= 0) return;
    const newQ = [...queue];
    const temp = newQ[idx];
    newQ[idx] = newQ[idx - 1];
    newQ[idx - 1] = temp;
    reorderQueue(newQ);
  };

  const moveDown = (idx) => {
    if (idx >= queue.length - 1) return;
    const newQ = [...queue];
    const temp = newQ[idx];
    newQ[idx] = newQ[idx + 1];
    newQ[idx + 1] = temp;
    reorderQueue(newQ);
  };

  return (
    <div className="queue-panel">
      {/* Header */}
      <div className="queue-header">
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: '800', fontFamily: 'var(--font-display)', margin: 0 }}>
            Play Queue
          </h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', margin: 0 }}>
            {queue.length} track{queue.length !== 1 ? 's' : ''} • Up next
          </p>
        </div>

        <div className="queue-header-actions">
          <button
            className={`btn-secondary ${shuffle ? 'active' : ''}`}
            onClick={shuffleQueue}
            disabled={queue.length <= 1}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', gap: '0.35rem' }}
            title="Shuffle Queue"
          >
            <IconShuffle size={14} color={shuffle ? 'var(--accent-primary)' : 'var(--text-secondary)'} />
            <span>Shuffle</span>
          </button>
          <button className="control-btn" onClick={onClose} title="Close Queue">
            <IconClose size={18} />
          </button>
        </div>
      </div>

      {/* Queue List */}
      <div className="queue-list">
        {queue.length === 0 ? (
          <div className="empty-bento-box" style={{ justifyContent: 'center', marginTop: '2rem' }}>
            <IconMusic size={24} color="var(--text-muted)" />
            <span>Queue is empty</span>
          </div>
        ) : (
          queue.map((track, idx) => {
            const isCurrent = currentTrack && currentTrack.id === track.id && idx === queueIndex;
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`queue-item ${isCurrent ? 'playing' : ''}`}
              >
                {/* Left: Play button, Cover Art & Metadata */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', overflow: 'hidden', flex: 1 }}>
                  {isCurrent && isPlaying ? (
                    <div className="vu-equalizer" style={{ flexShrink: 0, margin: '0 2px' }}>
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : (
                    <button
                      className="play-row-btn"
                      onClick={() => playTrack(track)}
                      style={{ flexShrink: 0 }}
                      title={isCurrent ? 'Pause' : 'Play'}
                    >
                      {isCurrent ? <IconPause size={12} /> : <IconPlay size={12} />}
                    </button>
                  )}

                  {track.cover_art_path ? (
                    <img
                      src={`/api/tracks/${track.id}/art`}
                      alt={track.title}
                      className="queue-track-art"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="queue-track-art-fallback">
                      <IconMusic size={18} color="var(--accent-primary)" />
                    </div>
                  )}

                  <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <div
                      className="track-name-bold"
                      style={{ fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={track.title}
                    >
                      {track.title}
                    </div>
                    <div
                      style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={track.artist}
                    >
                      {track.artist}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {formatDuration(track.duration_seconds || track.duration)}
                    </div>
                  </div>
                </div>

                {/* Right: Reorder & Remove Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', flexShrink: 0 }}>
                  <button
                    className="reorder-btn"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    title="Move Up"
                  >
                    <IconChevronUp size={15} />
                  </button>
                  <button
                    className="reorder-btn"
                    onClick={() => moveDown(idx)}
                    disabled={idx === queue.length - 1}
                    title="Move Down"
                  >
                    <IconChevronDown size={15} />
                  </button>
                  <button
                    className="reorder-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => removeFromQueue(idx)}
                    title="Remove from queue"
                  >
                    <IconClose size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
