import React, { useState } from 'react';
import { Play, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../services/api.js';
import { usePlayer } from '../context/PlayerContext.jsx';

export function SpeedDial({ pages = [], onRefresh }) {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const { playTrack } = usePlayer();

  if (!pages || pages.length === 0) return null;
  const currentPageTracks = pages[Math.min(currentPageIndex, pages.length - 1)] || [];

  return (
    <section aria-label="Speed Dial" className="px-4" data-purpose="speed-dial-section">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-3 group">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/10 bg-neutral-800 flex items-center justify-center">
            <span className="text-xs font-bold text-neutral-300">SD</span>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-yt-subtext font-bold leading-none">RECOMMENDED</p>
            <h2 className="text-xl font-bold tracking-tight text-white group-hover:text-neutral-300">Speed dial</h2>
          </div>
        </div>

        {/* Controls: Refresh & Pagination */}
        <div className="flex items-center space-x-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Refresh Speed Dial"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {pages.length > 1 && (
            <div className="flex items-center space-x-1">
              <button
                disabled={currentPageIndex === 0}
                onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                className="p-1 text-neutral-400 hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-medium text-neutral-400">
                {currentPageIndex + 1}/{pages.length}
              </span>
              <button
                disabled={currentPageIndex >= pages.length - 1}
                onClick={() => setCurrentPageIndex((prev) => Math.min(pages.length - 1, prev + 1))}
                className="p-1 text-neutral-400 hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3x3 Grid Layout */}
      <div className="grid grid-cols-3 gap-2.5">
        {currentPageTracks.map((track) => {
          const artUrl = track.coverUrl || track.cover_art_url || api.getTrackArtUrl(track.id);
          return (
            <div
              key={track.id}
              onClick={() => playTrack(track, currentPageTracks, currentPageTracks.indexOf(track))}
              className="relative aspect-square rounded-xl overflow-hidden cursor-pointer group bg-neutral-900 shadow-md ring-1 ring-white/5 hover:ring-white/20 transition-all"
            >
              <img
                src={artUrl}
                alt={track.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                onError={(e) => {
                  e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
                }}
              />
              <div className="absolute inset-0 card-gradient flex flex-col justify-end p-2">
                <p className="text-[12px] font-bold text-white line-clamp-1 leading-tight drop-shadow-sm">
                  {track.title}
                </p>
                <p className="text-[10px] font-medium text-neutral-300 line-clamp-1 opacity-90">
                  {track.artist || 'Unknown'}
                </p>
              </div>

              {/* Play Overlay */}
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <div className="w-9 h-9 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
