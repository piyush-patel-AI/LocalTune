import React, { useState, useRef } from 'react';
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Shuffle,
  Repeat,
  ListMusic,
  GripVertical,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api.js';
import { usePlayer } from '../context/PlayerContext.jsx';

function ReorderableQueueList({ queue, queueIndex, currentTrack, onReorder, onRemove, onPlayTrack }) {
  const containerRef = useRef(null);
  const [dragState, setDragState] = useState(null); // { fromIndex, currentIndex, startY, currentY }

  const handlePointerDown = (index, e) => {
    e.stopPropagation();
    e.preventDefault();
    const handleEl = e.currentTarget;
    try {
      handleEl.setPointerCapture(e.pointerId);
    } catch (_) {}

    setDragState({
      fromIndex: index,
      currentIndex: index,
      startY: e.clientY,
      currentY: e.clientY,
    });
  };

  const handlePointerMove = (e) => {
    if (!dragState || !containerRef.current) return;
    const container = containerRef.current;
    const children = Array.from(container.children);
    if (children.length === 0) return;

    const currentY = e.clientY;
    let newIndex = dragState.fromIndex;

    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      const midPoint = rect.top + rect.height / 2;
      if (currentY < midPoint) {
        newIndex = i;
        break;
      }
      if (i === children.length - 1 && currentY >= midPoint) {
        newIndex = i;
      }
    }

    setDragState((prev) => (prev ? { ...prev, currentY, currentIndex: newIndex } : null));
  };

  const handlePointerUp = () => {
    if (!dragState) return;
    if (dragState.fromIndex !== dragState.currentIndex) {
      onReorder(dragState.fromIndex, dragState.currentIndex);
    }
    setDragState(null);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="flex flex-col space-y-2 relative"
    >
      {queue.map((track, idx) => {
        const isCurrent = idx === queueIndex;
        const isDragging = dragState?.fromIndex === idx;
        const qArtUrl = track.coverUrl || track.cover_art_url || api.getTrackArtUrl(track.id);

        let transformStyle = '';
        if (dragState && !isDragging) {
          const { fromIndex, currentIndex } = dragState;
          if (fromIndex < currentIndex && idx > fromIndex && idx <= currentIndex) {
            transformStyle = 'translateY(-52px)';
          } else if (fromIndex > currentIndex && idx >= currentIndex && idx < fromIndex) {
            transformStyle = 'translateY(52px)';
          }
        }

        return (
          <div
            key={`${track.id}-${idx}`}
            onClick={() => !dragState && onPlayTrack(track, queue, idx)}
            className={`flex items-center justify-between p-2.5 rounded-xl border transition-transform duration-150 cursor-pointer select-none ${
              isDragging
                ? 'z-30 bg-neutral-800 border-yt-red shadow-2xl scale-[1.02] ring-1 ring-red-500/50 opacity-90'
                : isCurrent
                ? 'bg-white/15 border-white/20 text-white font-semibold shadow-md'
                : 'bg-black/30 border-white/5 text-neutral-300 hover:bg-white/10'
            }`}
            style={{
              transform: isDragging
                ? `translateY(${dragState.currentY - dragState.startY}px)`
                : transformStyle,
            }}
          >
            <div className="flex items-center space-x-2.5 min-w-0 flex-1">
              {/* Drag Handle */}
              <div
                onPointerDown={(e) => handlePointerDown(idx, e)}
                className="cursor-grab active:cursor-grabbing p-1.5 text-neutral-500 hover:text-white transition-colors touch-none"
                title="Drag to reorder"
                aria-label={`Drag to reorder ${track.title}`}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-4 h-4" />
              </div>

              <img
                src={qArtUrl}
                alt={track.title}
                className="w-10 h-10 rounded-lg object-cover bg-neutral-800 flex-shrink-0"
                onError={(e) => {
                  e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80';
                }}
              />

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{track.title}</p>
                <p className="text-[10px] text-neutral-400 truncate">{track.artist || 'Unknown'}</p>
              </div>
            </div>

            {/* Playing Badge & Remove Action */}
            <div className="flex items-center space-x-1 pl-2" onClick={(e) => e.stopPropagation()}>
              {isCurrent && (
                <span className="text-[10px] uppercase font-bold text-yt-red px-2 py-0.5 rounded bg-red-950/60 border border-red-800/40 mr-1">
                  Playing
                </span>
              )}

              <button
                onClick={() => onRemove(idx)}
                className="p-1.5 text-neutral-500 hover:text-red-400 transition-colors"
                title="Remove from Queue"
                aria-label="Remove from Queue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ExpandedPlayer() {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    queue,
    queueIndex,
    isPlayerExpanded,
    setPlayerExpanded,
    favoritesMap,
    togglePlay,
    seek,
    nextTrack,
    prevTrack,
    toggleFavorite,
    playTrack,
    reorderQueue,
    removeFromQueue,
  } = usePlayer();

  const [activeTab, setActiveTab] = useState('player'); // 'player' | 'queue'

  if (!isPlayerExpanded || !currentTrack) return null;

  const artUrl = currentTrack.coverUrl || currentTrack.cover_art_url || api.getTrackArtUrl(currentTrack.id);
  const isFav = !!favoritesMap[currentTrack.id];

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between liquid-glass-bg text-white max-w-md mx-auto animate-in fade-in zoom-in-95 duration-200 overflow-y-auto no-scrollbar"
      data-purpose="expanded-player"
    >
      {/* Top Bar */}
      <div className="relative pt-3 px-6 flex items-center justify-between z-10">
        <button
          onClick={() => setPlayerExpanded(false)}
          className="p-2 text-neutral-300 hover:text-white transition-colors"
          aria-label="Collapse player"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        {/* Tab Selector */}
        <div className="flex items-center space-x-1 bg-black/40 p-1 rounded-full border border-white/10">
          <button
            onClick={() => setActiveTab('player')}
            className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${
              activeTab === 'player' ? 'bg-white/20 text-white shadow' : 'text-neutral-400'
            }`}
          >
            Playing
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-1 rounded-full text-xs font-semibold transition-colors ${
              activeTab === 'queue' ? 'bg-white/20 text-white shadow' : 'text-neutral-400'
            }`}
          >
            Up Next ({queue.length})
          </button>
        </div>

        <button
          className="p-2 text-neutral-300 hover:text-white transition-colors"
          onClick={() => setActiveTab(activeTab === 'player' ? 'queue' : 'player')}
          aria-label="Toggle Up Next Queue"
        >
          <ListMusic className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'player' ? (
        <div className="flex-1 flex flex-col justify-center px-8 py-4 space-y-6">
          {/* Artwork Card with Liquid Gloss Glow */}
          <div className="relative aspect-square w-full rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/15 mx-auto max-w-[320px]">
            <img
              src={artUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&q=80';
              }}
            />
          </div>

          {/* Track Info & Like Button */}
          <div className="flex items-center justify-between pt-2">
            <div className="min-w-0 pr-4">
              <h1 className="text-2xl font-bold tracking-tight text-white truncate">
                {currentTrack.title}
              </h1>
              <p className="text-sm font-medium text-neutral-400 truncate mt-0.5">
                {currentTrack.artist || 'Unknown Artist'}
              </p>
            </div>
            <button
              onClick={() => toggleFavorite(currentTrack.id)}
              className="p-2.5 rounded-full hover:bg-white/10 transition-colors"
              aria-label="Toggle favorite"
            >
              <Heart
                className={`w-6 h-6 transition-colors ${
                  isFav ? 'text-yt-red fill-current' : 'text-neutral-400'
                }`}
              />
            </button>
          </div>

          {/* Scrubber Bar */}
          <div className="space-y-1.5 pt-2">
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={(e) => seek(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
            />
            <div className="flex justify-between text-xs text-neutral-400 font-medium px-0.5">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Primary Playback Controls */}
          <div className="flex items-center justify-between px-2 pt-2">
            <button className="p-2 text-neutral-400 hover:text-white transition-colors">
              <Shuffle className="w-5 h-5" />
            </button>
            <button
              onClick={prevTrack}
              className="p-3 text-white hover:opacity-80 transition-opacity"
              aria-label="Previous track"
            >
              <SkipBack className="w-7 h-7 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-current" />
              ) : (
                <Play className="w-7 h-7 fill-current ml-1" />
              )}
            </button>
            <button
              onClick={nextTrack}
              className="p-3 text-white hover:opacity-80 transition-opacity"
              aria-label="Next track"
            >
              <SkipForward className="w-7 h-7 fill-current" />
            </button>
            <button className="p-2 text-neutral-400 hover:text-white transition-colors">
              <Repeat className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        /* Up Next Reorderable Queue Tab */
        <div className="flex-1 flex flex-col p-6 overflow-y-auto no-scrollbar space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Up Next Queue</h2>
            <span className="text-xs text-neutral-400">Drag handle to reorder</span>
          </div>

          <ReorderableQueueList
            queue={queue}
            queueIndex={queueIndex}
            currentTrack={currentTrack}
            onReorder={reorderQueue}
            onRemove={removeFromQueue}
            onPlayTrack={playTrack}
          />
        </div>
      )}
    </div>
  );
}
