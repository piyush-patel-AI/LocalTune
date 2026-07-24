import { usePlayer } from '../context/PlayerContext';
import { IconClose, IconPlay, IconPause, IconMusic, IconChevronUp, IconChevronDown } from './Icons';

export default function QueuePanel({ onClose }) {
  const {
    queue,
    queueIndex,
    currentTrack,
    isPlaying,
    playTrack,
    removeFromQueue,
    reorderQueue
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
      <div className="queue-header">
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>Play Queue</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
            {queue.length} track{queue.length !== 1 ? 's' : ''} in queue
          </p>
        </div>
        <button className="control-btn" onClick={onClose}>
          <IconClose size={18} />
        </button>
      </div>

      <div className="queue-list">
        {queue.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
            Queue is empty
          </div>
        ) : (
          queue.map((track, idx) => {
            const isCurrent = currentTrack && currentTrack.id === track.id && idx === queueIndex;
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`queue-item ${isCurrent ? 'playing' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                  {isCurrent && isPlaying ? (
                    <div className="vu-equalizer" style={{ flexShrink: 0, margin: '0 4px' }}>
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : (
                    <button
                      className="play-row-btn"
                      onClick={() => playTrack(track)}
                      style={{ flexShrink: 0 }}
                    >
                      {isCurrent ? <IconPause size={12} /> : <IconPlay size={12} />}
                    </button>
                  )}
                  <div style={{ overflow: 'hidden' }}>
                    <div className="card-title" style={{ fontSize: '0.85rem' }}>{track.title}</div>
                    <div className="card-sub" style={{ fontSize: '0.75rem' }}>{track.artist}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <button
                    className="control-btn"
                    onClick={() => moveUp(idx)}
                    disabled={idx === 0}
                    title="Move Up"
                  >
                    <IconChevronUp size={16} />
                  </button>
                  <button
                    className="control-btn"
                    onClick={() => moveDown(idx)}
                    disabled={idx === queue.length - 1}
                    title="Move Down"
                  >
                    <IconChevronDown size={16} />
                  </button>
                  <button
                    className="control-btn"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => removeFromQueue(idx)}
                    title="Remove"
                  >
                    <IconClose size={16} />
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
