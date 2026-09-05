import React, { useState, useEffect } from 'react';
import { Header } from '../components/Header.jsx';
import { Library, Plus, Music, Heart, Disc3, User, X } from 'lucide-react';
import { api } from '../services/api.js';
import { usePlayer } from '../context/PlayerContext.jsx';

export function LibraryScreen() {
  const [activeTab, setActiveTab] = useState('playlists'); // playlists | songs | favorites | artists
  const [playlists, setPlaylists] = useState([]);
  const [songs, setSongs] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Playlist Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');

  const { playTrack } = usePlayer();

  const loadLibraryData = async () => {
    setLoading(true);
    try {
      const [pls, trks, favs, arts] = await Promise.allSettled([
        api.getPlaylists(),
        api.getTracks({ limit: 100 }),
        api.getFavorites(),
        api.getTracks({ groupBy: 'artist' }),
      ]);

      if (pls.status === 'fulfilled') setPlaylists(pls.value.playlists || pls.value || []);
      if (trks.status === 'fulfilled') setSongs(trks.value.tracks || trks.value || []);
      if (favs.status === 'fulfilled') setFavorites(favs.value.favorites || favs.value || []);
      if (arts.status === 'fulfilled') setArtists(arts.value.artists || arts.value || []);
    } catch (err) {
      console.error('Failed to load library data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibraryData();
  }, []);

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    try {
      await api.createPlaylist(newPlaylistName.trim(), newPlaylistDesc.trim());
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setIsModalOpen(false);
      loadLibraryData();
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-6 pt-1 pb-32 relative z-10">
      <Header />

      {/* Title & Floating Create Action */}
      <div className="px-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-yt-subtext font-bold leading-none">YOUR MUSIC</p>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center mt-1">
            <Library className="w-6 h-6 mr-2 text-yt-red" /> Library
          </h1>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white text-black text-xs font-bold shadow-md hover:bg-neutral-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Tab Filter Pill Chips */}
      <div className="px-4 flex items-center space-x-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'playlists', label: 'Playlists', icon: Disc3 },
          { id: 'songs', label: 'Songs', icon: Music },
          { id: 'favorites', label: 'Favorites', icon: Heart },
          { id: 'artists', label: 'Artists', icon: User },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                isActive ? 'bg-white text-black font-bold shadow' : 'bg-yt-chip text-white hover:bg-white/20'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content View */}
      {loading ? (
        <div className="px-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 bg-neutral-900 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="px-4 flex flex-col space-y-2">
          {activeTab === 'playlists' &&
            (playlists.length === 0 ? (
              <p className="text-sm text-neutral-500 py-8 text-center">No playlists found. Create one!</p>
            ) : (
              playlists.map((pl) => (
                <div
                  key={pl.id}
                  className="flex items-center space-x-3.5 p-2.5 rounded-2xl bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer border border-white/5"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-900 to-indigo-950 flex items-center justify-center text-white shadow-md">
                    <Disc3 className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white truncate">{pl.name}</p>
                    <p className="text-xs text-yt-subtext truncate">
                      {pl.track_count || 0} tracks • Playlist
                    </p>
                  </div>
                </div>
              ))
            ))}

          {activeTab === 'songs' &&
            songs.map((track, idx) => (
              <div
                key={track.id}
                onClick={() => playTrack(track, songs, idx)}
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

          {activeTab === 'favorites' &&
            (favorites.length === 0 ? (
              <p className="text-sm text-neutral-500 py-8 text-center">No favorites added yet.</p>
            ) : (
              favorites.map((track, idx) => (
                <div
                  key={track.id || idx}
                  onClick={() => playTrack(track, favorites, idx)}
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
              ))
            ))}

          {activeTab === 'artists' &&
            artists.map((art, idx) => (
              <div
                key={art.artist || idx}
                className="flex items-center space-x-3.5 p-2.5 rounded-2xl bg-neutral-900/60 hover:bg-neutral-800 transition-colors cursor-pointer border border-white/5"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden bg-neutral-800 shadow-md">
                  <img
                    src={api.getArtistImageUrl(art.artist)}
                    alt={art.artist}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.target.src = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&q=80';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">{art.artist || 'Unknown Artist'}</p>
                  <p className="text-xs text-yt-subtext truncate">{art.track_count || 1} tracks</p>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* New Playlist Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-[#1f1f1f] rounded-3xl p-6 border border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">New Playlist</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlaylist} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  placeholder="Playlist name"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-white/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-400 mb-1">Description (optional)</label>
                <textarea
                  placeholder="Add a description"
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  rows="2"
                  className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-white/30 resize-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-neutral-200 shadow-md"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
