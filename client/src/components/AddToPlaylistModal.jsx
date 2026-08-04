import { useState, useEffect } from 'react';
import PlaylistCover from './PlaylistCover';
import { IconClose, IconPlus, IconImage, IconCheck } from './Icons';

export default function AddToPlaylistModal({ track, onClose }) {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [addedPlaylistIds, setAddedPlaylistIds] = useState(new Set());
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (evt) => setCoverPreview(evt.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleAddToPlaylist = async (playlistId) => {
    try {
      const res = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trackId: track.id })
      });
      if (res.ok) {
        setAddedPlaylistIds((prev) => new Set(prev).add(playlistId));
        setStatusMsg('Track added to playlist!');
        fetchPlaylists();
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
      const formData = new FormData();
      formData.append('name', newPlaylistName.trim());
      if (coverFile) {
        formData.append('cover', coverFile);
      }

      const resCreate = await fetch('/api/playlists', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (resCreate.ok) {
        const data = await resCreate.json();
        await handleAddToPlaylist(data.playlist.id);
      } else {
        const data = await resCreate.json();
        setStatusMsg(data.error || 'Error creating playlist');
      }
    } catch (err) {
      setStatusMsg('Error creating playlist');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>Add to Playlist</h3>
          <button className="control-btn" onClick={onClose}>
            <IconClose size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Adding: <strong style={{ color: 'var(--text-primary)' }}>{track.title}</strong> by {track.artist}
        </p>

        {statusMsg && (
          <div style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
            {statusMsg}
          </div>
        )}

        <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '4px' }}>
          {playlists.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
              No playlists created yet. Create your first playlist below!
            </div>
          ) : (
            playlists.map((pl) => {
              const isAdded = addedPlaylistIds.has(pl.id);
              return (
                <div
                  key={pl.id}
                  onClick={() => handleAddToPlaylist(pl.id)}
                  style={{
                    padding: '0.6rem 0.75rem',
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    transition: 'all 0.2s ease'
                  }}
                  className="playlist-select-item"
                >
                  <PlaylistCover playlist={pl} size={44} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pl.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {pl.track_count || 0} {pl.track_count === 1 ? 'track' : 'tracks'}
                    </div>
                  </div>
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: isAdded ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {isAdded ? (
                      <IconCheck size={14} color="#000" />
                    ) : (
                      <IconPlus size={14} color="var(--text-secondary)" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create Playlist Form */}
        <form onSubmit={handleCreateAndAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>
            Create New Playlist
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <label
              style={{
                width: '46px',
                height: '46px',
                borderRadius: 'var(--radius-sm)',
                border: '1px dashed var(--border-color)',
                background: 'var(--bg-elevated)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                flexShrink: 0
              }}
              title="Upload optional cover image"
            >
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              {coverPreview ? (
                <img src={coverPreview} alt="Cover Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <IconImage size={20} color="var(--text-muted)" />
              )}
            </label>

            <input
              type="text"
              className="form-input"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              style={{ flex: 1 }}
            />

            <button type="submit" className="btn-primary" disabled={loading || !newPlaylistName.trim()}>
              <IconPlus size={16} color="#0f172a" />
              <span>Create</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
