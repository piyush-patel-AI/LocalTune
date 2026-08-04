import React from 'react';
import { IconX, IconBug } from './Icons';

export default function DebugScoreModal({ track, onClose }) {
  if (!track) return null;

  const b = track.scoreBreakdown || {};
  const scoreItems = [
    { label: 'Artist Match / Affinity', value: b.artist, color: '#6366f1' },
    { label: 'Genre Match / Affinity', value: b.genre, color: '#ec4899' },
    { label: 'Completion Ratio', value: b.completion, color: '#10b981' },
    { label: 'Discovery Boost', value: b.discovery, color: '#f59e0b' },
    { label: 'Transition Learning', value: b.transition, color: '#8b5cf6' },
    { label: 'Frequency / Recency', value: b.recent, color: '#3b82f6' },
    { label: 'Time of Day Match', value: b.timeOfDay, color: '#06b6d4' },
    { label: 'Replay Boost', value: b.replays, color: '#14b8a6' },
    { label: 'Favorited Bonus', value: b.favorites, color: '#eab308' },
    { label: 'Skip Penalty', value: b.skips, color: '#ef4444' }
  ];

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 2500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        className="modal-content glass-panel"
        style={{
          width: '100%',
          maxWidth: '480px',
          background: 'rgba(20,20,30,0.96)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '24px',
          color: '#fff'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconBug size={20} color="#6366f1" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Recommendation Breakdown</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}>
            <IconX size={20} />
          </button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>{track.title}</div>
          <div style={{ fontSize: '13px', color: '#aaa' }}>{track.artist} {track.genre ? `• ${track.genre}` : ''}</div>
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#6366f1', fontWeight: '600' }}>
            Reason: "{track.reason || 'Picked for your daily mix'}"
          </div>
          <div style={{ marginTop: '6px', fontSize: '20px', fontWeight: '700', color: '#10b981' }}>
            Total Score: {track.score || 0} pts
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '260px', overflowY: 'auto' }}>
          {scoreItems.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'rgba(255,255,255,0.03)',
                borderLeft: `4px solid ${item.color}`
              }}
            >
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.85)' }}>{item.label}</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: (item.value || 0) < 0 ? '#ef4444' : '#fff' }}>
                {(item.value || 0) > 0 ? `+${(item.value || 0).toFixed(1)}` : (item.value || 0).toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
