import { getArtworkUrl } from '../services/MediaMetadataProvider';
import logo from '../../../Assets/logo.png';
import { IconDisc } from './Icons';
import { apiUrl } from '../config';

export default function PlaylistCover({ playlist, tracks = [], size = 48, className = '' }) {
  if (!playlist) return null;

  // Custom uploaded cover image
  if (playlist.cover_path) {
    return (
      <div
        className={`playlist-cover-wrapper ${className}`}
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '10px', overflow: 'hidden', flexShrink: 0, position: 'relative' }}
      >
        <img
          src={apiUrl(`/api/playlists/${playlist.id}/cover`)}
          alt={playlist.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
      </div>
    );
  }

  // Determine artwork tracks
  let artworkTracks = [];
  if (Array.isArray(playlist.sample_tracks) && playlist.sample_tracks.length > 0) {
    artworkTracks = playlist.sample_tracks;
  } else if (Array.isArray(tracks) && tracks.length > 0) {
    artworkTracks = tracks.filter((t) => t.cover_art_path || t.coverArtPath).slice(0, 4);
  }

  // 4 or more artwork tracks: render 2x2 grid collage
  if (artworkTracks.length >= 4) {
    return (
      <div
        className={`playlist-art-grid ${className}`}
        style={{ width: `${size}px`, height: `${size}px`, flexShrink: 0, borderRadius: '10px', overflow: 'hidden' }}
      >
        {artworkTracks.slice(0, 4).map((t, idx) => (
          <img
            key={t.id || idx}
            src={getArtworkUrl(t, 256)}
            alt=""
            className="playlist-art-tile"
            onError={(e) => {
              e.target.src = logo;
            }}
          />
        ))}
      </div>
    );
  }

  // 1 to 3 artwork tracks: render first track's cover art
  if (artworkTracks.length > 0) {
    return (
      <div
        className={`playlist-cover-wrapper ${className}`}
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '10px', overflow: 'hidden', flexShrink: 0 }}
      >
        <img
          src={getArtworkUrl(artworkTracks[0], 256)}
          alt={playlist?.name || ''}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => { e.target.src = logo; }}
        />
      </div>
    );
  }

  // 0 tracks / no artwork: default fallback
  return (
    <div
      className={`playlist-art-fallback ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '10px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(168,85,247,0.2) 100%)',
        border: '1px solid rgba(255,255,255,0.1)'
      }}
    >
      <IconDisc size={Math.round(size * 0.45)} color="var(--accent-primary, #6366f1)" />
    </div>
  );
}
