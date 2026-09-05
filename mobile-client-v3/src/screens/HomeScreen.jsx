import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header.jsx';
import { CategoryChips } from '../components/CategoryChips.jsx';
import { SpeedDial } from '../components/SpeedDial.jsx';
import { QuickPicks } from '../components/QuickPicks.jsx';
import { api } from '../services/api.js';
import { recommendationService } from '../services/recommendationService.js';
import {
  buildSpeedDialPages,
  buildQuickPicks,
} from '../services/recommendationComposition.js';
import { usePlayer } from '../context/PlayerContext.jsx';
import { Play } from 'lucide-react';

export function HomeScreen() {
  const [activeCategory, setActiveCategory] = useState(null);
  const [candidatePool, setCandidatePool] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshOffset, setRefreshOffset] = useState(0);

  const { favoritesMap, listenHistory, playTrack } = usePlayer();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch server recommendations, shelves, and library tracks in parallel
      const [recs, recShelves, allTracks] = await Promise.allSettled([
        recommendationService.getRecommendations(),
        recommendationService.getShelves(),
        api.getTracks({ limit: 100 }),
      ]);

      const recTracks = recs.status === 'fulfilled' && Array.isArray(recs.value) ? recs.value : [];
      const libTracks =
        allTracks.status === 'fulfilled'
          ? Array.isArray(allTracks.value?.tracks)
            ? allTracks.value.tracks
            : Array.isArray(allTracks.value)
            ? allTracks.value
            : []
          : [];

      // Combine server recommendation candidates first (preserving rank), then fallback library candidates
      const seenIds = new Set(recTracks.map((t) => t.id));
      const pool = [...recTracks];
      for (const track of libTracks) {
        if (!seenIds.has(track.id)) {
          pool.push(track);
          seenIds.add(track.id);
        }
      }

      setCandidatePool(pool);
      if (recShelves.status === 'fulfilled') {
        setShelves(recShelves.value || []);
      }
    } catch (err) {
      console.error('Error loading Home feed:', err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter candidates if a category chip is selected
  const filteredCandidates = activeCategory
    ? candidatePool.filter((t) =>
        t.genre
          ? t.genre.toLowerCase().includes(activeCategory.toLowerCase())
          : t.title.toLowerCase().includes(activeCategory.toLowerCase())
      )
    : candidatePool;

  const speedDialPages = buildSpeedDialPages({
    candidatePool: filteredCandidates.length > 0 ? filteredCandidates : candidatePool,
    favoritesMap,
    listenHistory,
    pageCount: 3,
    pageSize: 9,
    pageOffset: refreshOffset,
  });

  const speedDialTrackIds = new Set();
  if (speedDialPages.length > 0) {
    // Only exclude Page 1 track IDs for Quick Picks so alternatives are shown
    speedDialPages[0].forEach((t) => speedDialTrackIds.add(t.id));
  }

  const quickPicksTracks = buildQuickPicks({
    candidatePool: filteredCandidates.length > 0 ? filteredCandidates : candidatePool,
    speedDialTrackIds,
    limit: 8,
  });

  return (
    <div className="flex-1 flex flex-col space-y-6 pt-1 pb-32 relative z-10">
      <Header />
      <CategoryChips activeCategory={activeCategory} onSelectCategory={setActiveCategory} />

      {loading ? (
        <div className="px-4 space-y-6">
          <div className="h-6 w-32 bg-neutral-900 animate-pulse rounded-lg" />
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="aspect-square bg-neutral-900 animate-pulse rounded-xl" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="px-4 py-8 text-center space-y-3">
          <p className="text-sm text-neutral-400">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-neutral-200"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Speed Dial Section */}
          <SpeedDial
            pages={speedDialPages}
            onRefresh={() => setRefreshOffset((prev) => prev + 1)}
          />

          {/* Quick Picks Section */}
          <QuickPicks tracks={quickPicksTracks} />

          {/* Recommendation Shelves Section */}
          {shelves.map((shelf, shelfIdx) => {
            const shelfTracks = shelf.tracks || shelf.items || [];
            if (!shelfTracks || shelfTracks.length === 0) return null;
            return (
              <section key={shelf.id || shelfIdx} className="px-4">
                <h2 className="text-xl font-bold tracking-tight text-white mb-3">
                  {shelf.title}
                </h2>
                <div className="flex space-x-3 overflow-x-auto no-scrollbar py-1">
                  {shelfTracks.map((track) => {
                    const artUrl = track.coverUrl || track.cover_art_url || api.getTrackArtUrl(track.id);
                    return (
                      <div
                        key={track.id}
                        onClick={() => playTrack(track, shelfTracks, shelfTracks.indexOf(track))}
                        className="flex-shrink-0 w-36 cursor-pointer group space-y-2"
                      >
                        <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-neutral-900 shadow-md">
                          <img
                            src={artUrl}
                            alt={track.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={(e) => {
                              e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&q=80';
                            }}
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Play className="w-6 h-6 text-white fill-current" />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white truncate">{track.title}</p>
                          <p className="text-[11px] text-yt-subtext truncate">
                            {track.artist || 'Unknown'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
