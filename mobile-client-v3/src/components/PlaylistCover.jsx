import React, { useState } from 'react';
import { Disc3 } from 'lucide-react';
import { api } from '../services/api.js';

export function PlaylistCover({ playlist, tracks = [], size = 48, className = '' }) {
  const [coverFailed, setCoverFailed] = useState(false);

  if (!playlist) return null;

  const storedCoverUrl = api.apiUrl(`/api/playlists/${playlist.id}/cover`);

  // Custom uploaded cover image
  if (playlist.cover_path && !coverFailed) {
    return (
      <div
        className={`relative overflow-hidden flex-shrink-0 bg-neutral-900 shadow-md ${className}`}
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '12px' }}
      >
        <img
          src={storedCoverUrl}
          alt={playlist.name}
          className="w-full h-full object-cover"
          onError={() => setCoverFailed(true)}
        />
      </div>
    );
  }

  // Determine artwork tracks from sample_tracks or passed tracks
  const artworkTracks = (
    Array.isArray(playlist.sample_tracks) && playlist.sample_tracks.length > 0
      ? playlist.sample_tracks
      : Array.isArray(tracks) && tracks.length > 0
      ? tracks
      : []
  ).filter((t) => t.id || t.cover_art_path || t.artwork_b2_key);

  // 4 or more artwork tracks: render 2x2 grid collage
  if (artworkTracks.length >= 4) {
    return (
      <div
        className={`grid grid-cols-2 grid-rows-2 flex-shrink-0 bg-neutral-900 overflow-hidden shadow-md ${className}`}
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '12px' }}
      >
        {artworkTracks.slice(0, 4).map((t, idx) => (
          <img
            key={t.id || idx}
            src={api.getTrackArtUrl(t.id)}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80';
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
        className={`relative overflow-hidden flex-shrink-0 bg-neutral-900 shadow-md ${className}`}
        style={{ width: `${size}px`, height: `${size}px`, borderRadius: '12px' }}
      >
        <img
          src={api.getTrackArtUrl(artworkTracks[0].id)}
          alt={playlist.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
          }}
        />
      </div>
    );
  }

  // Fallback: Clean disc icon with gradient
  return (
    <div
      className={`flex-shrink-0 bg-gradient-to-br from-purple-900/60 to-indigo-950/80 border border-white/10 flex items-center justify-center shadow-md ${className}`}
      style={{ width: `${size}px`, height: `${size}px`, borderRadius: '12px' }}
    >
      <Disc3 className="text-white/80" style={{ width: `${Math.round(size * 0.45)}px`, height: `${Math.round(size * 0.45)}px` }} />
    </div>
  );
}
