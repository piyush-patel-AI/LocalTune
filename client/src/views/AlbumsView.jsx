import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IconDisc, IconPlay, IconPause, IconMusic } from '../components/Icons';

export default function AlbumsView() {
  const [albums, setAlbums] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [albumTracks, setAlbumTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { playTrack, currentTrack, isPlaying } = usePlayer();

  useEffect(() => {
    async function fetchAlbums() {
      try {
        const res = await fetch('/api/tracks?groupBy=album', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAlbums(data.albums || []);
        }
      } catch (err) {
        console.error('Failed to fetch albums', err);
      } finally {
        setLoading(false);
      }
    }
    fetchAlbums();
  }, []);

  const handleSelectAlbum = async (album) => {
    setSelectedAlbum(album);
    try {
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(album.album)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.tracks || []).filter(t => t.album === album.album);
        setAlbumTracks(filtered);
      }
    } catch (err) {
      console.error('Error fetching album tracks', err);
    }
  };

  const playAlbum = async (album, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/tracks?search=${encodeURIComponent(album.album)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.tracks || []).filter(t => t.album === album.album);
        if (filtered.length > 0) {
          playTrack(filtered[0], filtered);
        }
      }
    } catch (err) {
      console.error('Error playing album', err);
    }
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Albums</h1>
          <p className="view-subtitle">{albums.length} albums in your studio catalog</p>
        </div>
        {selectedAlbum && (
          <button className="btn-secondary" onClick={() => setSelectedAlbum(null)}>
            ← Back to Albums
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Loading albums...</div>
      ) : selectedAlbum ? (
        <div>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem' }}>
            <div className="card-art" style={{ width: '140px', height: '140px', margin: 0, flexShrink: 0 }}>
              {selectedAlbum.cover_art_path || (albumTracks.length > 0 && albumTracks.some(t => t.cover_art_path)) ? (
                <img
                  src={`/api/tracks/${selectedAlbum.sample_track_id || albumTracks.find(t => t.cover_art_path)?.id || albumTracks[0]?.id}/art`}
                  alt={selectedAlbum.album}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <IconDisc size={56} color="var(--accent-primary)" />
              )}
            </div>
            <div>
              <h2 style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>{selectedAlbum.album}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginTop: '0.25rem' }}>
                By {selectedAlbum.artist} • {albumTracks.length} tracks
              </p>
              <button
                className="btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => playTrack(albumTracks[0], albumTracks)}
                disabled={albumTracks.length === 0}
              >
                <IconPlay size={16} color="#0f172a" fill="#0f172a" />
                <span>Play Album</span>
              </button>
            </div>
          </div>

          <table className="track-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>#</th>
                <th>Title</th>
                <th>Artist</th>
                <th>Format</th>
              </tr>
            </thead>
            <tbody>
              {albumTracks.map((track) => {
                const isCurrent = currentTrack && currentTrack.id === track.id;
                return (
                  <tr key={track.id} className={`track-row ${isCurrent ? 'active' : ''}`} onDoubleClick={() => playTrack(track, albumTracks)}>
                    <td>
                      {isCurrent && isPlaying ? (
                        <div className="vu-equalizer" style={{ marginLeft: '6px' }}>
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        <button className="play-row-btn" onClick={() => playTrack(track, albumTracks)}>
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
                        <div className="track-name-bold">{track.title}</div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{track.artist}</td>
                    <td>
                      <span className="format-badge">{track.format.toUpperCase()}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-grid">
          {albums.map((alb, idx) => (
            <div key={`${alb.album}-${idx}`} className="grid-card" onClick={() => handleSelectAlbum(alb)}>
              <div className="card-art">
                {alb.cover_art_path ? (
                  <img
                    src={`/api/tracks/${alb.sample_track_id}/art`}
                    alt={alb.album}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <IconDisc size={48} color="var(--accent-primary)" />
                )}
                <div className="overlay-play">
                  <button className="play-circle-btn" onClick={(e) => playAlbum(alb, e)}>
                    <IconPlay size={20} color="#111" fill="#111" style={{ marginLeft: '2px' }} />
                  </button>
                </div>
              </div>
              <div className="card-title">{alb.album}</div>
              <div className="card-sub">{alb.artist} • {alb.track_count} tracks</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
