import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import PlaylistCover from '../components/PlaylistCover';
import {
  IconPlay,
  IconPause,
  IconEdit,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconClose,
  IconPlus,
  IconMusic,
  IconSparkles,
  IconDisc,
  IconImage
} from '../components/Icons';

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function calculateTotalDuration(tracks) {
  const totalSecs = tracks.reduce((acc, t) => acc + (t.duration_seconds || t.duration || 0), 0);
  const mins = Math.floor(totalSecs / 60);
  if (mins < 60) return `${mins} mins`;
  const hrs = (mins / 60).toFixed(1);
  return `${hrs} hrs`;
}

export default function PlaylistsView() {
  const [playlists, setPlaylists] = useState([]);
  const [activePlaylist, setActivePlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editingName, setEditingName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const fetchPlaylists = async () => {
    try {
      const res = await fetch('/api/playlists', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const list = data.playlists || [];
        setPlaylists(list);
        if (list.length > 0 && !activePlaylist) {
          selectPlaylist(list[0]);
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

  const [newCoverFile, setNewCoverFile] = useState(null);
  const [newCoverPreview, setNewCoverPreview] = useState(null);

  const handleCoverUploadForPlaylist = async (e, playlistId) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('cover', file);

      const res = await fetch(`/api/playlists/${playlistId}/cover`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setActivePlaylist(data.playlist);
        fetchPlaylists();
      }
    } catch (err) {
      console.error('Error uploading playlist cover:', err);
    }
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const formData = new FormData();
      formData.append('name', newPlaylistName.trim());
      if (newCoverFile) {
        formData.append('cover', newCoverFile);
      }

      const res = await fetch('/api/playlists', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setNewPlaylistName('');
        setNewCoverFile(null);
        setNewCoverPreview(null);
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

    const trackIds = newTracks.map((t) => t.id);
    await fetch(`/api/playlists/${activePlaylist.id}/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ trackIds })
    });
  };

  const handleShufflePlay = () => {
    if (playlistTracks.length === 0) return;
    const shuffled = [...playlistTracks].sort(() => 0.5 - Math.random());
    playTrack(shuffled[0], shuffled);
  };

  // Extract artwork subset for composite artwork grid
  const artworkTracks = playlistTracks.filter((t) => t.cover_art_path).slice(0, 4);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Playlists</h1>
          <p className="view-subtitle">Organize and curate your personal music collection</p>
        </div>
      </div>

      <div className="playlist-view-layout">
        {/* Playlists Navigation Sidebar */}
        <div className="playlist-sidebar-card">
          <form onSubmit={handleCreatePlaylist} className="playlist-create-box">
            <input
              type="text"
              className="form-input"
              placeholder="+ New Playlist Name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
            />
            <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
              <IconPlus size={16} color="#0f172a" />
              <span>Create Playlist</span>
            </button>
          </form>

          <div className="playlist-nav-list">
            {playlists.length > 0 ? (
              playlists.map((pl) => {
                const isActive = activePlaylist && activePlaylist.id === pl.id;
                return (
                  <button
                    key={pl.id}
                    className={`playlist-item-btn ${isActive ? 'active' : ''}`}
                    onClick={() => selectPlaylist(pl)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}
                  >
                    <PlaylistCover playlist={pl} size={32} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {pl.name}
                    </span>
                    <span className="playlist-item-count">{pl.track_count || 0}</span>
                  </button>
                );
              })
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                No playlists yet.
              </div>
            )}
          </div>
        </div>

        {/* Selected Playlist Main Content */}
        <div>
          {activePlaylist ? (
            <div>
              {/* Hero Banner */}
              <div className="playlist-hero-banner">
                <label
                  style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
                  title="Click to upload custom cover art"
                >
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleCoverUploadForPlaylist(e, activePlaylist.id)}
                  />
                  <PlaylistCover playlist={activePlaylist} tracks={playlistTracks} size={140} />
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.4)',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: 0,
                      transition: 'opacity 0.2s'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
                  >
                    <IconImage size={28} color="#fff" />
                  </div>
                </label>

                <div className="playlist-meta-container">
                  {isEditing ? (
                    <div className="playlist-title-edit">
                      <input
                        type="text"
                        className="form-input"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        style={{ fontSize: '1.2rem', padding: '0.4rem 0.75rem' }}
                      />
                      <button className="btn-primary" onClick={handleRenamePlaylist}>Save</button>
                      <button className="btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                    </div>
                  ) : (
                    <div className="playlist-title-edit">
                      <h2 className="playlist-title-text">{activePlaylist.name}</h2>
                      <button
                        className="control-btn"
                        onClick={() => { setEditingName(activePlaylist.name); setIsEditing(true); }}
                        title="Rename Playlist"
                      >
                        <IconEdit size={18} />
                      </button>
                    </div>
                  )}

                  <div className="playlist-details-pill">
                    <span>PLAYLIST</span>
                    <span>•</span>
                    <span>{playlistTracks.length} TRACKS</span>
                    <span>•</span>
                    <span>{calculateTotalDuration(playlistTracks)}</span>
                  </div>

                  <div className="playlist-action-bar">
                    {playlistTracks.length > 0 && (
                      <>
                        <button
                          className="btn-primary"
                          onClick={() => {
                            if (currentTrack && playlistTracks.some((t) => t.id === currentTrack.id)) {
                              togglePlay();
                            } else {
                              playTrack(playlistTracks[0], playlistTracks);
                            }
                          }}
                        >
                          {isPlaying && playlistTracks.some((t) => t.id === currentTrack?.id) ? (
                            <>
                              <IconPause size={16} color="#0f172a" fill="#0f172a" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <IconPlay size={16} color="#0f172a" fill="#0f172a" />
                              <span>Play Playlist</span>
                            </>
                          )}
                        </button>
                        <button className="btn-secondary" onClick={handleShufflePlay}>
                          <IconSparkles size={16} color="var(--accent-primary)" />
                          <span>Shuffle</span>
                        </button>
                      </>
                    )}
                    <button className="btn-secondary btn-danger" onClick={() => handleDeletePlaylist(activePlaylist.id)}>
                      <IconTrash size={16} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Tracks Table */}
              {playlistTracks.length === 0 ? (
                <div className="empty-bento-box" style={{ padding: '2.5rem', justifyContent: 'center' }}>
                  <IconMusic size={28} color="var(--text-muted)" />
                  <span>Playlist is empty. Add songs from your Library using the ➕ button!</span>
                </div>
              ) : (
                <table className="track-table">
                  <thead>
                    <tr>
                      <th style={{ width: '45px' }}>#</th>
                      <th>Title</th>
                      <th>Artist</th>
                      <th>Album</th>
                      <th style={{ textAlign: 'center', width: '80px' }}>Reorder</th>
                      <th style={{ width: '70px', textAlign: 'right' }}>Time</th>
                      <th style={{ width: '50px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playlistTracks.map((track, idx) => {
                      const isCurrent = currentTrack && currentTrack.id === track.id;
                      return (
                        <tr
                          key={`${track.id}-${idx}`}
                          className={`track-row ${isCurrent ? 'active' : ''}`}
                          onDoubleClick={() => playTrack(track, playlistTracks)}
                        >
                          <td>
                            {isCurrent && isPlaying ? (
                              <div className="vu-equalizer" style={{ marginLeft: '4px' }}>
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

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              {track.cover_art_path ? (
                                <img
                                  src={`/api/tracks/${track.id}/art`}
                                  alt={track.title}
                                  className="track-thumb"
                                  onError={(e) => { e.target.style.display = 'none'; }}
                                />
                              ) : (
                                <div className="track-thumb-fallback">
                                  <IconMusic size={16} color="var(--accent-primary)" />
                                </div>
                              )}
                              <div>
                                <div className="track-name-bold">{track.title}</div>
                                {track.format && (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                    {track.format.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          <td style={{ color: 'var(--text-secondary)' }}>{track.artist}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{track.album || 'Single'}</td>

                          <td>
                            <div className="reorder-btns" style={{ justifyContent: 'center' }}>
                              <button
                                className="reorder-btn"
                                onClick={() => moveTrack(idx, -1)}
                                disabled={idx === 0}
                                title="Move Up"
                              >
                                <IconChevronUp size={16} />
                              </button>
                              <button
                                className="reorder-btn"
                                onClick={() => moveTrack(idx, 1)}
                                disabled={idx === playlistTracks.length - 1}
                                title="Move Down"
                              >
                                <IconChevronDown size={16} />
                              </button>
                            </div>
                          </td>

                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            {formatDuration(track.duration_seconds || track.duration)}
                          </td>

                          <td style={{ textAlign: 'center' }}>
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
            <div className="empty-bento-box" style={{ padding: '3rem', justifyContent: 'center' }}>
              <IconMusic size={28} color="var(--text-muted)" />
              <span>Select or create a playlist from the left panel to begin.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
