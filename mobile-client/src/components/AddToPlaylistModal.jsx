import { useState, useEffect } from 'react';
import BottomSheet from './BottomSheet';
import PlaylistCover from './PlaylistCover';
import { IconPlus, IconCheck, IconImage } from './Icons';
import { apiUrl } from '../config';

export default function AddToPlaylistModal({ track, onClose }) {
  const [playlists, setPlaylists] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [addedPlaylistIds, setAddedPlaylistIds] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const fetchPlaylists = async () => {
    try {
      const res = await fetch(apiUrl('/api/playlists'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.playlists || []);
      }
    } catch (err) {
      console.error('Fetch playlists error:', err);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setCoverFile(file);
      const reader = new FileReader();
      reader.onload = (evt) => {
        setCoverPreview(evt.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddToPlaylist = async (playlistId) => {
    try {
      const res = await fetch(apiUrl(`/api/playlists/${playlistId}/tracks`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ trackId: track.id })
      });
      if (res.ok) {
        setAddedPlaylistIds((prev) => new Set(prev).add(playlistId));
        setStatusMsg('Added to playlist!');
        fetchPlaylists();
        setTimeout(() => onClose(), 700);
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

      const resCreate = await fetch(apiUrl('/api/playlists'), {
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
    <BottomSheet onClose={onClose}>
      <div className="sheet-header" style={{ paddingBottom: '0.75rem' }}>
        <div>
          <h3 className="sheet-title">Add to Playlist</h3>
          <p className="sheet-subtitle" style={{ margin: '0.2rem 0 0 0' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{track.title}</span> • {track.artist}
          </p>
        </div>
        <button className="sheet-close-btn" onClick={onClose}>✕</button>
      </div>

      {statusMsg && (
        <div
          className="sheet-status"
          style={{
            background: 'rgba(34, 197, 94, 0.15)',
            color: '#22c55e',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            marginBottom: '0.75rem',
            textAlign: 'center'
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* Playlist List */}
      <div
        className="sheet-playlists-list"
        style={{
          maxHeight: '260px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          marginBottom: '1rem',
          paddingRight: '4px'
        }}
      >
        {playlists.length === 0 ? (
          <div className="sheet-empty" style={{ textAlign: 'center', padding: '1.5rem', color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
            No playlists created yet. Use the option below to create your first playlist!
          </div>
        ) : (
          playlists.map((pl) => {
            const isAdded = addedPlaylistIds.has(pl.id);
            return (
              <div
                key={pl.id}
                className="sheet-playlist-item"
                onClick={() => handleAddToPlaylist(pl.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.65rem 0.75rem',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <PlaylistCover playlist={pl} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pl.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255, 255, 255, 0.6)' }}>
                    {pl.track_count || 0} {pl.track_count === 1 ? 'track' : 'tracks'}
                  </div>
                </div>

                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: isAdded ? 'var(--accent-primary)' : 'rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {isAdded ? (
                    <IconCheck size={16} color="#000" />
                  ) : (
                    <IconPlus size={16} color="rgba(255, 255, 255, 0.8)" />
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Create New Playlist Form Toggle */}
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            width: '100%',
            padding: '0.75rem',
            borderRadius: '12px',
            border: '1px dashed var(--accent-primary)',
            background: 'rgba(99, 102, 241, 0.1)',
            color: 'var(--accent-primary)',
            fontWeight: '600',
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer'
          }}
        >
          <IconPlus size={18} color="var(--accent-primary)" />
          <span>Create New Playlist</span>
        </button>
      ) : (
        <form onSubmit={handleCreateAndAdd} style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.85rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
            Create New Playlist
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            {/* Custom Cover Art File Picker */}
            <label
              style={{
                width: '50px',
                height: '50px',
                borderRadius: '8px',
                border: '1px dashed rgba(255, 255, 255, 0.2)',
                background: 'rgba(0, 0, 0, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                position: 'relative',
                flexShrink: 0
              }}
              title="Upload optional cover art"
            >
              <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
              {coverPreview ? (
                <img src={coverPreview} alt="Cover Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <IconImage size={20} color="rgba(255, 255, 255, 0.5)" />
              )}
            </label>

            <input
              type="text"
              className="sheet-input"
              placeholder="Playlist Name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              style={{
                flex: 1,
                padding: '0.65rem 0.85rem',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#fff',
                outline: 'none',
                fontSize: '0.9rem'
              }}
              autoFocus
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setCoverFile(null);
                setCoverPreview(null);
              }}
              style={{
                padding: '0.5rem 0.85rem',
                borderRadius: '8px',
                border: 'none',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !newPlaylistName.trim()}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--accent-primary)',
                color: '#000',
                fontWeight: '700',
                fontSize: '0.85rem',
                opacity: loading || !newPlaylistName.trim() ? 0.5 : 1
              }}
            >
              {loading ? 'Creating...' : 'Create & Add'}
            </button>
          </div>
        </form>
      )}
    </BottomSheet>
  );
}
