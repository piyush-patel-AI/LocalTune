import React, { useState, useEffect } from 'react';
import { Search, X, Play, Music, User } from 'lucide-react';
import { api } from '../services/api.js';
import { usePlayer } from '../context/PlayerContext.jsx';

export function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([
    'KRS-One',
    'Midnight City',
    'Synthwave',
    'Lofi Beats',
  ]);

  const { playTrack } = usePlayer();

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.getTracks({ search: query.trim() });
        setResults(res.tracks || res || []);
      } catch (err) {
        console.error('Search query failed:', err);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectRecent = (term) => {
    setQuery(term);
  };

  const handleClearRecent = (term) => {
    setRecentSearches((prev) => prev.filter((s) => s !== term));
  };

  return (
    <div className="flex-1 flex flex-col space-y-4 pt-3 pb-32 relative z-10 px-4">
      {/* Search Input Bar */}
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-neutral-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs, artists, albums..."
          autoFocus
          className="w-full pl-11 pr-10 py-3 rounded-full bg-neutral-900 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-white/30 shadow-inner"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3 p-1.5 text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results View */}
      {query.trim() ? (
        loading ? (
          <div className="space-y-3 pt-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 bg-neutral-900 animate-pulse rounded-xl" />
            ))}
          </div>
        ) : results.length === 0 ? (
          <div className="py-12 text-center text-neutral-500 text-sm">
            No results found for "{query}"
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-yt-subtext">
              Tracks & Results ({results.length})
            </h2>
            <div className="flex flex-col space-y-2">
              {results.map((track, idx) => (
                <div
                  key={track.id}
                  onClick={() => {
                    playTrack(track, results, idx);
                    if (!recentSearches.includes(query)) {
                      setRecentSearches((prev) => [query, ...prev.slice(0, 5)]);
                    }
                  }}
                  className="flex items-center space-x-3 p-2.5 rounded-xl bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer border border-white/5 group"
                >
                  <div className="relative w-11 h-11 rounded-lg overflow-hidden flex-shrink-0 bg-neutral-800">
                    <img
                      src={api.getTrackArtUrl(track.id)}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80';
                      }}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play className="w-5 h-5 text-white fill-current ml-0.5" />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-white truncate group-hover:text-neutral-200">
                      {track.title}
                    </p>
                    <p className="text-[10px] text-yt-subtext truncate">
                      {track.artist || 'Unknown Artist'} • {track.album || 'Single'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        /* Recent Searches View */
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-yt-subtext">Recent Searches</h2>
            {recentSearches.length > 0 && (
              <button
                onClick={() => setRecentSearches([])}
                className="text-xs text-neutral-400 hover:text-white"
              >
                Clear All
              </button>
            )}
          </div>

          <div className="flex flex-col space-y-1">
            {recentSearches.map((term) => (
              <div
                key={term}
                onClick={() => handleSelectRecent(term)}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-neutral-900 transition-colors cursor-pointer group"
              >
                <div className="flex items-center space-x-3 text-neutral-300 group-hover:text-white">
                  <Search className="w-4 h-4 text-neutral-500" />
                  <span className="text-xs font-medium">{term}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearRecent(term);
                  }}
                  className="text-neutral-500 hover:text-white p-1"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
