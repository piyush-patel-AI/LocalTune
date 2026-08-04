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
        alignItems: 'flex-end',
        padding: '0'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxHeight: '90vh',
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Edit Song Metadata</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff' }}>
            <IconX size={24} />
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
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Artist</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Album</label>
            <input
              type="text"
              value={album}
              onChange={(e) => setAlbum(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Genre</label>
            <GenreSelector value={genre} onChange={setGenre} />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }}>Year</label>
            <input
              type="number"
              value={year}
              placeholder="e.g. 2024"
              onChange={(e) => setYear(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontSize: '14px' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '16px' }}>
            <button
              type="submit"
              disabled={saving}
              style={{
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
              {saving ? 'Saving...' : 'Save Changes'}
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#aaa',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '14px'
              }}
            >
              <IconRefresh size={18} /> Restore Original Metadata
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
