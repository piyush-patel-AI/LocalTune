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

      setSuccessMsg(`Successfully updated ${data.updatedCount} tracks!`);
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
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 2000,
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
          maxWidth: '500px',
          background: 'var(--bg-glass, rgba(20,20,30,0.95))',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '24px',
          color: '#fff'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h2 style={{ margin: 0, fontSize: '19px', fontWeight: '600' }}>
            Bulk Edit ({selectedTrackIds.length} Songs Selected)
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
            <IconX size={22} />
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

        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', marginBottom: '16px' }}>
          Leave fields blank if you do not wish to overwrite them for selected songs.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Genre</label>
            <GenreSelector value={genre} onChange={setGenre} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Artist (Optional)</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Overwrites all"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Album (Optional)</label>
              <input
                type="text"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                placeholder="Overwrites all"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Year (Optional)</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="e.g. 2024"
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ background: 'var(--accent-primary, #6366f1)', border: 'none', color: '#fff', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
            >
              {saving ? 'Updating...' : `Apply to ${selectedTrackIds.length} Songs`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
