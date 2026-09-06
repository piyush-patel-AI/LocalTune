import React, { useState, useRef, useEffect } from 'react';
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

// ── Dominant color extraction via canvas ─────────────────────────────────────
const colorCache = new Map();

/**
 * Derive a representative color from artwork using a lightweight single-pass
 * quantization. The canvas is drawn small (48x48) and only read once when the
 * artwork changes — never during playback or per-render.
 *
 * Picks the most frequent quantized color bucket that is neither too dark nor
 * too close to grey, so the ambient background visibly relates to the artwork
 * instead of flattening to a muddy average.
 */
function extractDominantColor(img) {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const w = 48;
    const h = 48;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(img, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);
    const buckets = new Map();

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const a = data[i + 3];
      if (a < 125) continue; // skip transparent pixels

      // Quantize to reduce noise and collapse near-identical shades
      r = Math.round(r / 32) * 32;
      g = Math.round(g / 32) * 32;
      b = Math.round(b / 32) * 32;

      const key = `${r},${g},${b}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }

    if (buckets.size === 0) return null;

    // Prefer the most frequent bucket that is vivid enough and not too dark.
    let best = null;
    let bestScore = -Infinity;
    for (const [key, count] of buckets) {
      const [r, g, b] = key.split(',').map(Number);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      if (lum < 45) continue; // too dark — would blend into the black player
      // Favor frequency, boosted by saturation so colorful artworks keep identity
      const score = count * (1 + sat * 2);
      if (score > bestScore) {
        bestScore = score;
        best = { r, g, b };
      }
    }

    // Fallback: if everything was too dark, use the overall average (kept dark)
    if (!best) {
      let R = 0, G = 0, B = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 125) continue;
        R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
      }
      if (n === 0) return null;
      return `rgb(${Math.round(R / n)},${Math.round(G / n)},${Math.round(B / n)})`;
    }

    // Dim so it reads as an ambient wash, not a solid color block
    const dim = 0.5;
    const r = Math.round(best.r * dim);
    const g = Math.round(best.g * dim);
    const b = Math.round(best.b * dim);
    return `rgb(${r},${g},${b})`;
  } catch (_) {
    return null;
  }
}

function CustomScrubber({ currentTime, duration, onSeek }) {
  const scrubberRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handlePointerDown = (e) => {
    if (!scrubberRef.current || !duration) return;
    e.preventDefault();
    e.stopPropagation();
    scrubberRef.current.setPointerCapture(e.pointerId);
    setIsDragging(true);

    const rect = scrubberRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !scrubberRef.current || !duration) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      ref={scrubberRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative w-full h-6 flex items-center cursor-pointer touch-none select-none"
      role="slider"
      aria-label="Seek"
      aria-valuenow={Math.round(currentTime)}
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
    >
      {/* Track background */}
      <div className="absolute left-0 right-0 h-1.5 rounded-full bg-white/20" />

      {/* Played portion */}
      <div
        className="absolute left-0 h-1.5 rounded-full bg-yt-red transition-none"
        style={{ width: `${progress}%` }}
      />

      {/* Thumb */}
      <div
        className="absolute h-4 w-4 rounded-full bg-white shadow-lg shadow-black/40 pointer-events-none"
        style={{
          left: `calc(${progress}% - 8px)`,
          top: '50%',
          transform: 'translateY(-50%)',
          transition: isDragging ? 'none' : 'left 80ms ease-out',
        }}
      />
    </div>
  );
}

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
  const [ambientColor, setAmbientColor] = useState('#030303');

  useEffect(() => {
    setAmbientColor('#030303');
  }, [currentTrack?.id]);

  if (!isPlayerExpanded || !currentTrack) return null;

  const artUrl = currentTrack.coverUrl || currentTrack.cover_art_url || api.getTrackArtUrl(currentTrack.id);
  const isFav = !!favoritesMap[currentTrack.id];

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleArtworkLoad = (e) => {
    const img = e.target;
    if (!img.naturalWidth) return;
    const cached = colorCache.get(currentTrack.id);
    if (cached) {
      setAmbientColor(cached);
      return;
    }
    const color = extractDominantColor(img);
    if (color) {
      colorCache.set(currentTrack.id, color);
      setAmbientColor(color);
    }
  };

  const ambientBg = `radial-gradient(circle at 50% 30%, ${ambientColor} 0%, rgba(30,10,35,0.95) 70%, #030303 100%)`;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-between text-white max-w-md mx-auto animate-in fade-in zoom-in-95 duration-200 overflow-y-auto no-scrollbar ambient-bg-transition"
      style={{ background: ambientBg }}
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
          {/* Artwork Card */}
          <div className="relative aspect-square w-full rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/15 mx-auto max-w-[320px]">
            <img
              src={artUrl}
              alt={currentTrack.title}
              className="w-full h-full object-cover"
              onLoad={handleArtworkLoad}
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

          {/* Custom Scrubber Bar */}
          <div className="space-y-1.5 pt-2">
            <CustomScrubber currentTime={currentTime} duration={duration} onSeek={seek} />
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
