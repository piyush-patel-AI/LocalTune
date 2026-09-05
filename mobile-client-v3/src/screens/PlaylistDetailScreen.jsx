import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, Shuffle, MoreVertical, Trash2, Music } from 'lucide-react';
import { api } from '../services/api.js';
import { PlaylistCover } from '../components/PlaylistCover.jsx';
import { usePlayer } from '../context/PlayerContext.jsx';

export function PlaylistDetailScreen({ playlistId, onBack }) {
  const [playlist, setPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { playTrack, currentTrack, isPlaying, togglePlay } = usePlayer();

  const loadPlaylistDetails = async () => {
    if (!playlistId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPlaylistTracks(playlistId);
      if (res && res.tracks) {
        setTracks(res.tracks);
      }
      // Also fetch playlist object if needed
      const allPls = await api.getPlaylists();
      const currentPl = (allPls.playlists || allPls || []).find((p) => p.id === Number(playlistId));
      if (currentPl) {
        setPlaylist(currentPl);
      } else {
        setPlaylist({ id: Number(playlistId), name: 'Playlist' });
      }
    } catch (err) {
      console.error('Failed to load playlist details:', err);
      setError('Failed to load playlist tracks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlaylistDetails();
  }, [playlistId]);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks, 0);
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      const shuffled = [...tracks].sort(() => Math.random() - 0.5);
      playTrack(shuffled[0], shuffled, 0);
    }
  };

  const handleRemoveTrack = async (trackId, e) => {
    e.stopPropagation();
    try {
      await api.removeTrackFromPlaylist(playlistId, trackId);
      setTracks((prev) => prev.filter((t) => t.id !== trackId));
    } catch (err) {
      console.error('Failed to remove track from playlist:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-4 pt-3 pb-32 relative z-10 px-4">
      {/* Top Header Navigation */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onBack}
          className="p-2 rounded-full bg-neutral-900 border border-white/10 text-white hover:bg-neutral-800 transition-colors"
          aria-label="Back to Library"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-white uppercase tracking-wider">Playlist</span>
      </div>

      {loading ? (
        <div className="space-y-4 py-6">
          <div className="w-36 h-36 mx-auto bg-neutral-900 animate-pulse rounded-2xl" />
          <div className="h-6 w-40 mx-auto bg-neutral-900 animate-pulse rounded-lg" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 bg-neutral-900 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="py-12 text-center space-y-3">
          <p className="text-sm text-neutral-400">{error}</p>
          <button
            onClick={loadPlaylistDetails}
            className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Playlist Header Card */}
          <div className="flex flex-col items-center text-center space-y-3 pt-2 pb-4 border-b border-white/10">
            <PlaylistCover playlist={playlist} tracks={tracks} size={144} className="shadow-2xl ring-1 ring-white/15" />
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">{playlist?.name}</h1>
              <p className="text-xs text-yt-subtext mt-1 font-medium">
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} • LocalTune Playlist
              </p>
            </div>

            {/* Action Buttons */}
            {tracks.length > 0 && (
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={handlePlayAll}
                  className="flex items-center space-x-2 px-6 py-2.5 rounded-full bg-white text-black text-xs font-bold shadow-lg hover:bg-neutral-200 transition-transform active:scale-95"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>Play All</span>
                </button>

                <button
                  onClick={handleShufflePlay}
                  className="p-2.5 rounded-full bg-neutral-900 border border-white/10 text-white hover:bg-neutral-800 transition-colors"
                  title="Shuffle Play"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Track List */}
          {tracks.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Music className="w-8 h-8 text-neutral-600 mx-auto" />
              <p className="text-sm text-neutral-400 font-medium">This playlist is empty.</p>
              <p className="text-xs text-neutral-500">Add tracks from Quick Picks or Search!</p>
            </div>
          ) : (
            <div className="flex flex-col space-y-1 pt-2">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id || idx}
                    onClick={() => playTrack(track, tracks, idx)}
                    className={`flex items-center justify-between p-2.5 rounded-xl transition-colors cursor-pointer group ${
                      isCurrent
                        ? 'bg-white/15 border border-white/20 text-white font-semibold'
                        : 'bg-neutral-900/60 hover:bg-neutral-800 border border-white/5 text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <span className="w-5 text-center text-xs font-bold text-neutral-500 flex-shrink-0">
                        {idx + 1}
                      </span>
                      <img
                        src={api.getTrackArtUrl(track.id)}
                        alt={track.title}
                        className="w-10 h-10 rounded-lg object-cover bg-neutral-800 flex-shrink-0"
                        onError={(e) => {
                          e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80';
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate group-hover:text-white">{track.title}</p>
                        <p className="text-[10px] text-yt-subtext truncate">{track.artist || 'Unknown Artist'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 pl-2">
                      <button
                        onClick={(e) => handleRemoveTrack(track.id, e)}
                        className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors"
                        title="Remove from playlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
