import React, { useState, useEffect } from 'react';
import GenreSelector from './GenreSelector';
import { IconX, IconRefresh, IconCheck } from './Icons';

export default function EditMetadataModal({ track, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [genre, setGenre] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (track) {
      setTitle(track.title || '');
      setArtist(track.artist || '');
      setAlbum(track.album || '');
      setGenre(track.genre || '');
      setYear(track.year ? String(track.year) : '');
    }
  }, [track]);

  if (!track) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/tracks/${track.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title,
          artist,
          album,
          genre,
          year: year ? parseInt(year, 10) : null
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update metadata');

      setSuccessMsg('Metadata updated successfully!');
      setTimeout(() => {
        if (onSave) onSave(data.track);
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Restore original metadata from initial upload/scan?')) return;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/tracks/${track.id}/reset-metadata`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset metadata');

      setTitle(data.track.title || '');
      setArtist(data.track.artist || '');
      setAlbum(data.track.album || '');
      setGenre(data.track.genre || '');
      setYear(data.track.year ? String(data.track.year) : '');

      setSuccessMsg('Restored original metadata!');
      setTimeout(() => setSuccessMsg(''), 2000);
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
        background: 'rgba(0,0,0,0.7)',
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
          maxWidth: '520px',
          background: 'var(--bg-glass, rgba(20,20,30,0.95))',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.15)',
          padding: '24px',
          color: '#fff',
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Edit Song Metadata</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
          >
            <IconX size={22} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div style={{ background: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', color: '#86efac', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconCheck size={18} /> {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Song Title</label>
            <input
              type="text"
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Artist</label>
              <input
                type="text"
                className="form-input"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Album</label>
              <input
                type="text"
                className="form-input"
                value={album}
                onChange={(e) => setAlbum(e.target.value)}
                required
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Genre</label>
              <GenreSelector value={genre} onChange={setGenre} />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Year</label>
              <input
                type="number"
                className="form-input"
                value={year}
                placeholder="e.g. 2024"
                onChange={(e) => setYear(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px' }}>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#aaa',
                padding: '8px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px'
              }}
            >
              <IconRefresh size={16} /> Restore Original
            </button>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                style={{
                  background: 'var(--accent-primary, #6366f1)',
                  border: 'none',
                  color: '#fff',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
