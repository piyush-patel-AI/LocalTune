import React from 'react';
import { Play, MoreVertical, Plus } from 'lucide-react';
import { api } from '../services/api.js';
import { usePlayer } from '../context/PlayerContext.jsx';

export function QuickPicks({ tracks = [] }) {
  const { playTrack, addToQueue } = usePlayer();

  if (!tracks || tracks.length === 0) return null;

  return (
    <section aria-label="Quick Picks" className="px-4" data-purpose="quick-picks-section">
      <div className="flex flex-col mb-3">
        <p className="text-[10px] uppercase tracking-wider text-yt-subtext font-bold leading-none">
          START RADIO FROM A SONG
        </p>
        <h2 className="text-xl font-bold tracking-tight text-white mt-1">Quick picks</h2>
      </div>

      <div className="flex flex-col space-y-2">
        {tracks.map((track, idx) => {
          const artUrl = track.coverUrl || track.cover_art_url || api.getTrackArtUrl(track.id);
          return (
            <div
              key={track.id || idx}
              className="flex items-center justify-between p-2 rounded-xl bg-neutral-900/60 hover:bg-neutral-800/80 transition-colors group cursor-pointer border border-white/5"
              onClick={() => playTrack(track, tracks, idx)}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800">
                  <img
                    src={artUrl}
                    alt={track.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-neutral-200">
                    {track.title}
                  </p>
                  <p className="text-xs text-yt-subtext truncate">
                    {track.artist || 'Unknown Artist'} • {track.album || 'Single'}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => addToQueue(track)}
                  className="p-2 text-neutral-400 hover:text-white transition-colors"
                  title="Add to queue"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button className="p-2 text-neutral-400 hover:text-white transition-colors">
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
