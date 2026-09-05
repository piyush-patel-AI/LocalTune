import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header.jsx';
import { Compass, Flame, Music2, Sparkles, Play } from 'lucide-react';
import { api } from '../services/api.js';
import { recommendationService } from '../services/recommendationService.js';
import { usePlayer } from '../context/PlayerContext.jsx';

const MOODS_AND_GENRES = [
  { name: 'Pop', color: 'from-pink-600 to-purple-800' },
  { name: 'Hip-Hop', color: 'from-amber-600 to-red-800' },
  { name: 'Indie & Rock', color: 'from-emerald-600 to-teal-900' },
  { name: 'Electronic', color: 'from-blue-600 to-indigo-900' },
  { name: 'Workout', color: 'from-orange-600 to-rose-900' },
  { name: 'Chill & Relax', color: 'from-cyan-600 to-blue-900' },
  { name: 'Focus & Study', color: 'from-slate-600 to-zinc-900' },
  { name: 'Romance', color: 'from-rose-600 to-pink-900' },
];

export function ExploreScreen() {
  const [discoveryTracks, setDiscoveryTracks] = useState([]);
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [genreTracks, setGenreTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { playTrack } = usePlayer();

  useEffect(() => {
    async function loadExploreData() {
      setLoading(true);
      try {
        const tracks = await recommendationService.getDiscoveryRadar();
        setDiscoveryTracks(tracks);
      } catch (err) {
        console.error('Failed to load discovery radar:', err);
      } finally {
        setLoading(false);
      }
    }
    loadExploreData();
  }, []);

  const handleSelectGenre = async (genreName) => {
    if (selectedGenre === genreName) {
      setSelectedGenre(null);
      setGenreTracks([]);
      return;
    }
    setSelectedGenre(genreName);
    try {
      const res = await api.getTracks({ search: genreName, limit: 20 });
      setGenreTracks(res.tracks || res || []);
    } catch (err) {
      console.error('Failed to fetch genre tracks:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-6 pt-1 pb-32 relative z-10">
      <Header />

      <div className="px-4 space-y-1">
        <p className="text-[10px] uppercase tracking-wider text-yt-subtext font-bold leading-none">DISCOVER</p>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center">
          <Compass className="w-6 h-6 mr-2 text-yt-red" /> Explore
        </h1>
      </div>

      {/* Featured Shortcut Chips */}
      <div className="px-4 grid grid-cols-3 gap-2.5">
        <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-800 border border-white/5 cursor-pointer hover:border-white/20 transition-all">
          <Flame className="w-5 h-5 text-amber-500" />
          <span className="text-xs font-semibold text-white">New Releases</span>
        </div>
        <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-800 border border-white/5 cursor-pointer hover:border-white/20 transition-all">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <span className="text-xs font-semibold text-white">Charts</span>
        </div>
        <div className="flex items-center space-x-2.5 p-3 rounded-2xl bg-gradient-to-r from-neutral-900 to-neutral-800 border border-white/5 cursor-pointer hover:border-white/20 transition-all">
          <Music2 className="w-5 h-5 text-cyan-400" />
          <span className="text-xs font-semibold text-white">Moods</span>
        </div>
      </div>

      {/* Moods & Genres Grid */}
      <section className="px-4 space-y-3">
        <h2 className="text-lg font-bold text-white tracking-tight">Moods & Genres</h2>
        <div className="grid grid-cols-2 gap-3">
          {MOODS_AND_GENRES.map((mg) => {
            const isSelected = selectedGenre === mg.name;
            return (
              <div
                key={mg.name}
                onClick={() => handleSelectGenre(mg.name)}
                className={`relative h-20 rounded-2xl p-3 bg-gradient-to-br ${mg.color} overflow-hidden cursor-pointer shadow-md hover:scale-[1.02] transition-transform border ${
                  isSelected ? 'ring-2 ring-white border-white' : 'border-white/10'
                }`}
              >
                <span className="text-sm font-bold text-white drop-shadow">{mg.name}</span>
                <div className="absolute -right-2 -bottom-2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm transform rotate-12" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Selected Genre Results */}
      {selectedGenre && genreTracks.length > 0 && (
        <section className="px-4 space-y-3">
          <h2 className="text-lg font-bold text-white tracking-tight">{selectedGenre} Tracks</h2>
          <div className="flex flex-col space-y-2">
            {genreTracks.map((track, idx) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, genreTracks, idx)}
                className="flex items-center space-x-3 p-2 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <img
                  src={api.getTrackArtUrl(track.id)}
                  alt={track.title}
                  className="w-10 h-10 rounded-lg object-cover bg-neutral-800"
                  onError={(e) => {
                    e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80';
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-white truncate">{track.title}</p>
                  <p className="text-[10px] text-yt-subtext truncate">{track.artist || 'Unknown'}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Discovery Radar Section */}
      <section className="px-4 space-y-3">
        <h2 className="text-lg font-bold text-white tracking-tight">Discovery Radar</h2>
        {loading ? (
          <div className="h-32 bg-neutral-900 animate-pulse rounded-2xl" />
        ) : (
          <div className="flex space-x-3 overflow-x-auto no-scrollbar py-1">
            {discoveryTracks.map((track, idx) => (
              <div
                key={track.id || idx}
                onClick={() => playTrack(track, discoveryTracks, idx)}
                className="flex-shrink-0 w-32 cursor-pointer group space-y-1.5"
              >
                <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-neutral-900 shadow-md">
                  <img
                    src={api.getTrackArtUrl(track.id)}
                    alt={track.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
                    }}
                  />
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play className="w-5 h-5 text-white fill-current" />
                  </div>
                </div>
                <p className="text-xs font-bold text-white truncate">{track.title}</p>
                <p className="text-[10px] text-yt-subtext truncate">{track.artist || 'Unknown'}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
