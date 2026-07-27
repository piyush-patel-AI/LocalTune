import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { IconUser, IconPlay, IconPause, IconMusic } from '../components/Icons';

export default function ArtistsView() {
  const [artists, setArtists] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [artistTracks, setArtistTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { playTrack, currentTrack, isPlaying } = usePlayer();

  useEffect(() => {
    async function fetchArtists() {
      try {
        const res = await fetch('/api/tracks?groupBy=artist', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setArtists(data.artists || []);
        }
      } catch (err) {
        console.error('Failed to fetch artists', err);
      } finally {
        setLoading(false);
      }
    }
    fetchArtists();
  }, []);

  const handleSelectArtist = async (art) => {
    setSelectedArtist(art);
    try {
      const res = await fetch(`/api/tracks?artist=${encodeURIComponent(art.artist)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.tracks || []).filter(t => t.artist && t.artist.toLowerCase().includes(art.artist.toLowerCase()));
        setArtistTracks(filtered);
      }
    } catch (err) {
      console.error('Error fetching artist tracks', err);
    }
  };

  const playArtist = async (art, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/tracks?artist=${encodeURIComponent(art.artist)}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const filtered = (data.tracks || []).filter(t => t.artist && t.artist.toLowerCase().includes(art.artist.toLowerCase()));
        if (filtered.length > 0) {
          playTrack(filtered[0], filtered);
        }
      }
    } catch (err) {
      console.error('Error playing artist', err);
    }
  };

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">Artists</h1>
          <p className="view-subtitle">{artists.length} artists in your catalog</p>
        </div>
        {selectedArtist && (
          <button className="btn-secondary" onClick={() => setSelectedArtist(null)}>
            ← Back to Artists
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>Loading artists...</div>
      ) : selectedArtist ? (
        <div>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', marginBottom: '2rem' }}>
            <div className="card-art" style={{ width: '140px', height: '140px', borderRadius: '50%', margin: 0, flexShrink: 0 }}>
              {selectedArtist.artist_image_path ? (
                <img
                  src={`/api/tracks/artist-image/${encodeURIComponent(selectedArtist.artist)}`}
                  alt={selectedArtist.artist}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              ) : (
                <IconUser size={56} color="var(--accent-primary)" />
              )}
            </div>
            <div>
              <h2 style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-display)' }}>{selectedArtist.artist}</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginTop: '0.25rem' }}>
                {selectedArtist.album_count} albums • {artistTracks.length} tracks
              </p>
              <button
                className="btn-primary"
                style={{ marginTop: '1rem' }}
                onClick={() => playTrack(artistTracks[0], artistTracks)}
                disabled={artistTracks.length === 0}
              >
                <IconPlay size={16} color="#0f172a" fill="#0f172a" />
                <span>Play All Songs</span>
              </button>
            </div>
          </div>

          <table className="track-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>#</th>
                <th>Title</th>
                <th>Album</th>
                <th>Format</th>
              </tr>
            </thead>
            <tbody>
              {artistTracks.map((track) => {
                const isCurrent = currentTrack && currentTrack.id === track.id;
                return (
                  <tr key={track.id} className={`track-row ${isCurrent ? 'active' : ''}`} onDoubleClick={() => playTrack(track, artistTracks)}>
                    <td>
                      {isCurrent && isPlaying ? (
                        <div className="vu-equalizer" style={{ marginLeft: '6px' }}>
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        <button className="play-row-btn" onClick={() => playTrack(track, artistTracks)}>
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
                    <td style={{ color: 'var(--text-secondary)' }}>{track.album}</td>
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
          {artists.map((art, idx) => (
            <div key={`${art.artist}-${idx}`} className="grid-card" onClick={() => handleSelectArtist(art)}>
              <div className="card-art" style={{ borderRadius: '50%' }}>
                {art.artist_image_path ? (
                  <img
                    src={`/api/tracks/artist-image/${encodeURIComponent(art.artist)}`}
                    alt={art.artist}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <IconUser size={48} color="var(--accent-primary)" />
                )}
                <div className="overlay-play" style={{ borderRadius: '50%' }}>
                  <button className="play-circle-btn" onClick={(e) => playArtist(art, e)}>
                    <IconPlay size={20} color="#111" fill="#111" style={{ marginLeft: '2px' }} />
                  </button>
                </div>
              </div>
              <div className="card-title" style={{ textAlign: 'center' }}>{art.artist}</div>
              <div className="card-sub" style={{ textAlign: 'center' }}>{art.track_count} tracks • {art.album_count} albums</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
