import { useState, useEffect } from 'react';
import { IconClose, IconPlus } from './Icons';

export default function AddToPlaylistModal({ track, onClose }) {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchPlaylists = async () => {
    try {
      const res = await fetch('/api/playlists', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.playlists || []);
      }
    } catch (err) {
      console.error('Fetch playlists error:', err);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleAddToPlaylist = async (playlistId) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trackId: track.id })
      });
      if (res.ok) {
        setStatusMsg('Track added to playlist!');
        setTimeout(() => onClose(), 800);
      } else {
        const data = await res.json();
        setStatusMsg(data.error || 'Failed to add track');
      }
    } catch (err) {
      setStatusMsg('Error adding track');
    }
  };

  const handleCreateAndAdd = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    setLoading(true);

    try {
      const resCreate = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newPlaylistName.trim() })
      });

      if (resCreate.ok) {
        const data = await resCreate.json();
        await handleAddToPlaylist(data.playlist.id);
      }
    } catch (err) {
      setStatusMsg('Error creating playlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>Add to Playlist</h3>
          <button className="control-btn" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Adding: <strong>{track.title}</strong> by {track.artist}
        </p>

        {statusMsg && (
          <div style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
            {statusMsg}
          </div>
        )}

        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1.5rem' }}>
          {playlists.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No playlists yet. Create one below!</div>
          ) : (
            playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => handleAddToPlaylist(pl.id)}
                style={{
                  padding: '0.65rem',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '0.5rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justify: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>{pl.name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{pl.track_count} tracks</span>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleCreateAndAdd} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="New playlist name..."
            value={newPlaylistName}
            onChange={(e) => setNewPlaylistName(e.target.value)}
          />
          <button type="submit" className="btn-primary" disabled={loading}>
            <IconPlus size={16} color="#0f172a" />
            <span>Create</span>
          </button>
        </form>
      </div>
    </div>
  );
}
