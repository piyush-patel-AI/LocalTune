import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import {
  IconPlay,
  IconPause,
  IconEdit,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconClose,
  IconPlus,
  IconMusic
} from '../components/Icons';

export default function PlaylistsView() {
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editingName, setEditingName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const { playTrack, currentTrack, isPlaying } = usePlayer();

  const fetchPlaylists = async () => {
    try {
      const res = await fetch('/api/playlists', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.playlists || []);
        if (data.playlists.length > 0 && !activePlaylist) {
          selectPlaylist(data.playlists[0]);
        }
      }
    } catch (err) {
      console.error('Fetch playlists error:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectPlaylist = async (pl) => {
    setActivePlaylist(pl);
    setIsEditing(false);
    try {
      const res = await fetch(`/api/playlists/${pl.id}/tracks`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPlaylistTracks(data.tracks || []);
      }
    } catch (err) {
      console.error('Fetch playlist tracks error:', err);
    }
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newPlaylistName.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setNewPlaylistName('');
        await fetchPlaylists();
        selectPlaylist(data.playlist);
      }
    } catch (err) {
      console.error('Create playlist error:', err);
    }
  };

  const handleRenamePlaylist = async () => {
    if (!editingName.trim() || !activePlaylist) return;

    try {
      const res = await fetch(`/api/playlists/${activePlaylist.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: editingName.trim() })
      });

      if (res.ok) {
        const data = await res.json();
        setActivePlaylist(data.playlist);
        setIsEditing(false);
        fetchPlaylists();
      }
    } catch (err) {
      console.error('Rename playlist error:', err);
    }
  };

  const handleDeletePlaylist = async (plId) => {
    if (!window.confirm('Are you sure you want to delete this playlist?')) return;

    try {
      const res = await fetch(`/api/playlists/${plId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setActivePlaylist(null);
        setPlaylistTracks([]);
        fetchPlaylists();
      }
    } catch (err) {
      console.error('Delete playlist error:', err);
    }
  };

  const handleRemoveTrack = async (trackId) => {
    if (!activePlaylist) return;
    try {
      const res = await fetch(`/api/playlists/${activePlaylist.id}/tracks/${trackId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPlaylistTracks(data.tracks || []);
        fetchPlaylists();
      }
    } catch (err) {
      console.error('Remove track error:', err);
    }
  };

  const moveTrack = async (index, direction) => {
    if (!activePlaylist) return;
    const newTracks = [...playlistTracks];
    const targetIdx = index + direction;

    if (targetIdx < 0 || targetIdx >= newTracks.length) return;

    const temp = newTracks[index];
    newTracks[index] = newTracks[targetIdx];
    newTracks[targetIdx] = temp;

    setPlaylistTracks(newTracks);

    // Save order to server
    const trackIds = newTracks.map(t => t.id);
    await fetch(`/api/playlists/${activePlaylist.id}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ trackIds })
    });
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Your Playlists</h1>
          <p className="view-subtitle">Private custom playlists for your account</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '2rem' }}>
        {/* Playlists List Sidebar */}
        <div style={{ backgroundColor: 'var(--bg-card)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-color)' }}>
          <form onSubmit={handleCreatePlaylist} style={{ marginBottom: '1.25rem' }}>
            <input
              type="text"
              className="form-input"
              placeholder="+ New Playlist Name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              style={{ marginBottom: '0.5rem' }}
            />
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
              <IconPlus size={16} color="#0f172a" />
              <span>Create Playlist</span>
            </button>
          </form>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {playlists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => selectPlaylist(pl)}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  backgroundColor: activePlaylist && activePlaylist.id === pl.id ? 'var(--bg-card-hover)' : 'transparent',
                  borderLeft: activePlaylist && activePlaylist.id === pl.id ? '3px solid var(--accent-primary)' : '3px solid transparent',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{pl.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{pl.track_count} tracks</div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Playlist Content */}
        <div>
          {activePlaylist ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div>
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                      />
                      <button className="btn-primary" onClick={handleRenamePlaylist}>Save</button>
                      <button className="btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <h2 style={{ fontSize: '1.75rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>{activePlaylist.name}</h2>
                      <button
                        className="control-btn"
                        onClick={() => { setEditingName(activePlaylist.name); setIsEditing(true); }}
                        title="Rename Playlist"
                      >
                        <IconEdit size={18} />
                      </button>
                    </div>
                  )}
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem', fontFamily: 'var(--font-mono)' }}>
                    {playlistTracks.length} tracks
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {playlistTracks.length > 0 && (
                    <button className="btn-primary" onClick={() => playTrack(playlistTracks[0], playlistTracks)}>
                      <IconPlay size={16} color="#0f172a" fill="#0f172a" />
                      <span>Play Playlist</span>
                    </button>
                  )}
                  <button className="btn-secondary btn-danger" onClick={() => handleDeletePlaylist(activePlaylist.id)}>
                    <IconTrash size={16} />
                    <span>Delete Playlist</span>
                  </button>
                </div>
              </div>

              {playlistTracks.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Playlist is empty. Add songs from your Music Library or Search view using the ➕ button!
                </div>
              ) : (
                <table className="track-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px' }}>#</th>
                      <th>Title</th>
                      <th>Artist</th>
                      <th>Order</th>
                      <th style={{ width: '60px' }}>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playlistTracks.map((track, idx) => {
                      const isCurrent = currentTrack && currentTrack.id === track.id;
                      return (
                        <tr key={`${track.id}-${idx}`} className={`track-row ${isCurrent ? 'active' : ''}`} onDoubleClick={() => playTrack(track, playlistTracks)}>
                          <td>
                            {isCurrent && isPlaying ? (
                              <div className="vu-equalizer" style={{ marginLeft: '6px' }}>
                                <span />
                                <span />
                                <span />
                              </div>
                            ) : (
                              <button className="play-row-btn" onClick={() => playTrack(track, playlistTracks)}>
                                {isCurrent ? <IconPause size={14} /> : <IconPlay size={14} />}
                              </button>
                            )}
                          </td>
                          <td className="track-name-bold">{track.title}</td>
                          <td style={{ color: 'var(--text-secondary)' }}>{track.artist}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              <button
                                className="control-btn"
                                onClick={() => moveTrack(idx, -1)}
                                disabled={idx === 0}
                                title="Move Up"
                              >
                                <IconChevronUp size={16} />
                              </button>
                              <button
                                className="control-btn"
                                onClick={() => moveTrack(idx, 1)}
                                disabled={idx === playlistTracks.length - 1}
                                title="Move Down"
                              >
                                <IconChevronDown size={16} />
                              </button>
                            </div>
                          </td>
                          <td>
                            <button
                              className="control-btn"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => handleRemoveTrack(track.id)}
                              title="Remove from playlist"
                            >
                              <IconClose size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select or create a playlist from the left panel.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
