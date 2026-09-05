import React from 'react';
import { Play, Pause, SkipForward } from 'lucide-react';
import { api } from '../services/api.js';
import { usePlayer } from '../context/PlayerContext.jsx';

export function MiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    setPlayerExpanded,
  } = usePlayer();

  if (!currentTrack) return null;

  const artUrl = currentTrack.coverUrl || currentTrack.cover_art_url || api.getTrackArtUrl(currentTrack.id);
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="fixed bottom-[60px] left-1/2 -translate-x-1/2 w-full max-w-md px-3 z-40"
      data-purpose="mini-player"
    >
      <div
        onClick={() => setPlayerExpanded(true)}
        className="relative bg-[#212121]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 flex items-center justify-between shadow-2xl cursor-pointer overflow-hidden group"
      >
        {/* Top Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-neutral-800">
          <div
            className="h-full bg-yt-red transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Track Metadata */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 flex-shrink-0 shadow-md">
            <img
              src={artUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
              }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate leading-snug">
              {currentTrack.title}
            </p>
            <p className="text-[11px] text-yt-subtext truncate">
              {currentTrack.artist || 'Unknown Artist'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-2 pl-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-md hover:scale-105 active:scale-95 transition-transform"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>
          <button
            onClick={nextTrack}
            className="p-2 text-neutral-300 hover:text-white transition-colors"
            aria-label="Next track"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>
        </div>
      </div>
    </div>
  );
}
