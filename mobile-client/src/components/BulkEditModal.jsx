import React, { useState } from 'react';
import GenreSelector from './GenreSelector';
import { IconX, IconCheck } from './Icons';

export default function BulkEditModal({ selectedTrackIds = [], onClose, onSave }) {
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  if (selectedTrackIds.length === 0) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const res = await fetch('/api/tracks/bulk-edit', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trackIds: selectedTrackIds,
          genre: genre || undefined,
          year: year ? parseInt(year, 10) : undefined,
          artist: artist || undefined,
          album: album || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to bulk edit metadata');

      setSuccessMsg(`Updated ${data.updatedCount} tracks!`);
      setTimeout(() => {
        if (onSave) onSave();
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

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
        zIndex: 3000,
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
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            Bulk Edit ({selectedTrackIds.length} Songs)
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff' }}>
            <IconX size={24} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', color: '#86efac', padding: '10px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconCheck size={18} /> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Genre</label>
            <GenreSelector value={genre} onChange={setGenre} />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Artist (Optional)</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Overwrites artist for selected"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Album (Optional)</label>
            <input
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              placeholder="Overwrites album for selected"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Year (Optional)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2024"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              marginTop: '14px',
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              background: '#6366f1',
              border: 'none',
              color: '#fff',
              fontWeight: '600',
              fontSize: '15px'
            }}
          >
            {saving ? 'Updating...' : `Apply to ${selectedTrackIds.length} Songs`}
          </button>
        </form>
      </div>
    </div>
  );
}
