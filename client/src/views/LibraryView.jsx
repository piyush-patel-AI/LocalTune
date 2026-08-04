import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import AddToPlaylistModal from '../components/AddToPlaylistModal';
import EditMetadataModal from '../components/EditMetadataModal';
import { IconPlay, IconPause, IconHeart, IconPlus, IconMusic, IconEdit } from '../components/Icons';

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function LibraryView() {
  const [tracks, setTracks] = useState([]);
  const [sortBy, setSortBy] = useState('title');
  const [loading, setLoading] = useState(true);
  const [selectedTrackForPlaylist, setSelectedTrackForPlaylist] = useState(null);
  const [selectedTrackForEdit, setSelectedTrackForEdit] = useState(null);

  const { currentTrack, isPlaying, playTrack, toggleFavorite, favoritesMap } = usePlayer();

  const fetchTracks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tracks?sortBy=${sortBy}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTracks(data.tracks || []);
      }
    } catch (err) {
      console.error('Failed to fetch tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, [sortBy]);

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Music Library</h1>
          <p className="view-subtitle">{tracks.length} lossless & studio audio tracks available</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {tracks.length > 0 && (
            <button className="btn-primary" onClick={() => playTrack(tracks[0], tracks)}>
              <IconPlay size={16} color="#0f172a" fill="#0f172a" />
              <span>Play All</span>
            </button>
          )}

          <select
            className="form-input"
            style={{ width: 'auto', padding: '0.6rem 1rem', fontFamily: 'var(--font-sans)', fontWeight: '600' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="title">Sort by Title</option>
            <option value="artist">Sort by Artist</option>
            <option value="album">Sort by Album</option>
            <option value="date_added">Sort by Date Added</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Loading library catalog...</div>
      ) : tracks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          No music tracks found in your studio library.
        </div>
      ) : (
        <table className="track-table">
          <thead>
            <tr>
              <th style={{ width: '45px' }}>#</th>
              <th>Track & Format</th>
              <th>Artist</th>
              <th>Album</th>
              <th style={{ width: '90px' }}>Duration</th>
              <th style={{ width: '120px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => {
              const isCurrent = currentTrack && currentTrack.id === track.id;
              const isFav = !!favoritesMap[track.id];

              return (
                <tr
                  key={track.id}
                  className={`track-row ${isCurrent ? 'active' : ''}`}
                  onDoubleClick={() => playTrack(track, tracks)}
                >
                  <td>
                    {isCurrent && isPlaying ? (
                      <div className="vu-equalizer" style={{ marginLeft: '6px' }}>
                        <span />
                        <span />
                        <span />
                      </div>
                    ) : (
                      <button
                        className="play-row-btn"
                        onClick={() => playTrack(track, tracks)}
                        title="Play Track"
                      >
                        {isCurrent ? <IconPause size={14} /> : <IconPlay size={14} />}
                      </button>
                    )}
                  </td>
                  <td>
                    <div className="track-title-cell">
                      {track.cover_art_path ? (
                        <img
                          src={`/api/tracks/${track.id}/art`}
                          alt={track.title}
                          className="track-art-placeholder"
                          style={{ objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="track-art-placeholder">
                          <IconMusic size={18} color="var(--text-secondary)" />
                        </div>
                      )}
                      <div>
                        <div className="track-name-bold">{track.title}</div>
                        <div style={{ marginTop: '0.2rem' }}>
                          <span className="format-badge">{track.format.toUpperCase()}</span>
                          {track.genre && (
                            <span className="format-badge" style={{ marginLeft: '0.35rem', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.3)' }}>
                              {track.genre}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{track.artist}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{track.album}</td>
                  <td style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                    {formatTime(track.duration_seconds)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        className={`fav-toggle-btn ${isFav ? 'is-fav' : ''}`}
                        onClick={() => toggleFavorite(track.id)}
                        title={isFav ? 'Remove Favorite' : 'Favorite'}
                      >
                        <IconHeart
                          size={18}
                          color={isFav ? 'var(--accent-crimson)' : 'var(--text-muted)'}
                          fill={isFav ? 'var(--accent-crimson)' : 'none'}
                        />
                      </button>
                      <button
                        className="control-btn"
                        style={{ fontSize: '1rem' }}
                        onClick={() => setSelectedTrackForPlaylist(track)}
                        title="Add to Playlist"
                      >
                        <IconPlus size={18} />
                      </button>
                      <button
                        className="control-btn"
                        style={{ fontSize: '1rem' }}
                        onClick={() => setSelectedTrackForEdit(track)}
                        title="Edit Track Info"
                      >
                        <IconEdit size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {selectedTrackForPlaylist && (
        <AddToPlaylistModal
          track={selectedTrackForPlaylist}
          onClose={() => setSelectedTrackForPlaylist(null)}
        />
      )}

      {selectedTrackForEdit && (
        <EditMetadataModal
          track={selectedTrackForEdit}
          onClose={() => setSelectedTrackForEdit(null)}
          onSave={() => {
            fetchTracks();
            setSelectedTrackForEdit(null);
          }}
        />
      )}
    </div>
  );
}
