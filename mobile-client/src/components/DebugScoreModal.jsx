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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 3500,
        display: 'flex',
        alignItems: 'flex-end'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxHeight: '85vh',
          background: 'rgba(20,20,30,0.98)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '24px',
          color: '#fff',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconBug size={22} color="#6366f1" />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Score Breakdown</h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff' }}>
            <IconX size={24} />
          </button>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>{track.title}</div>
          <div style={{ fontSize: '13px', color: '#aaa', marginTop: '2px' }}>{track.artist}</div>
          <div style={{ marginTop: '8px', fontSize: '13px', color: '#6366f1', fontWeight: '500' }}>
            Reason: "{track.reason || 'Picked for your daily mix'}"
          </div>
          <div style={{ marginTop: '6px', fontSize: '20px', fontWeight: '700', color: '#10b981' }}>
            Score: {track.score || 0} pts
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {scoreItems.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.04)',
                borderLeft: `4px solid ${item.color}`
              }}
            >
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.9)' }}>{item.label}</span>
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
