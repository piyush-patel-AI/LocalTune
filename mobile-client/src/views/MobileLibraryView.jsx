import { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import PlaylistCover from '../components/PlaylistCover';
import {
  IconHeart,
  IconMusic,
  IconPlay,
  IconPlus,
  IconChevronRight,
  IconChevronLeft,
  IconUser,
  IconListPlus,
  IconTrash,
  IconDisc,
  IconImage,
  IconGrid,
  IconList
} from '../components/Icons';

export default function MobileLibraryView() {
  const { playTrack, favoritesMap, selectedArtistForView, setSelectedArtistForView } = usePlayer();
  const [activeTab, setActiveTab] = useState('all'); // all | playlists | albums | artists | liked
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [playlists, setPlaylists] = useState([]);
  const [artists, setArtists] = useState([]);
  const [likedTracks, setLikedTracks] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [allTracks, setAllTracks] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistCoverFile, setNewPlaylistCoverFile] = useState(null);
  const [newPlaylistCoverPreview, setNewPlaylistCoverPreview] = useState(null);

  useEffect(() => {
    if (selectedArtistForView) {
      if (typeof selectedArtistForView === 'string') {
        setSelectedArtist({ artist: selectedArtistForView });
      } else {
        setSelectedArtist(selectedArtistForView);
      }
    }
  }, [selectedArtistForView]);

  useEffect(() => {
    fetchLibraryData();
  }, [favoritesMap]);

  const fetchLibraryData = async () => {
    try {
      const [favRes, playRes, artRes, tracksRes] = await Promise.all([
        fetch('/api/favorites', { credentials: 'include' }),
        fetch('/api/playlists', { credentials: 'include' }),
        fetch('/api/tracks?groupBy=artist', { credentials: 'include' }),
        fetch('/api/tracks', { credentials: 'include' })
      ]);

      if (favRes.ok) {
        const dataFav = await favRes.json();
        setLikedTracks(dataFav.favorites || []);
      }

      if (playRes.ok) {
        const dataPlay = await playRes.json();
        setPlaylists(dataPlay.playlists || []);
      }

      if (artRes.ok) {
        const dataArt = await artRes.json();
        setArtists(dataArt.artists || []);
      }

      if (tracksRes.ok) {
        const dataTracks = await tracksRes.json();
        const tracks = Array.isArray(dataTracks) ? dataTracks : (dataTracks.tracks || []);
        setAllTracks(tracks);

        // Group tracks by album
        const albumGroup = {};
        tracks.forEach((tr) => {
          const albName = tr.album || 'Unknown Album';
          if (!albumGroup[albName]) {
            albumGroup[albName] = {
              name: albName,
              artist: tr.artist || 'Unknown Artist',
              cover_art_path: tr.cover_art_path,
              firstTrackId: tr.id,
              tracks: []
            };
          }
          albumGroup[albName].tracks.push(tr);
        });
        setAlbums(Object.values(albumGroup));
      }
    } catch (err) {
      console.error('Error fetching library data:', err);
    }
  };

  const openPlaylist = async (pl) => {
    try {
      const res = await fetch(`/api/playlists/${pl.id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const playlistObj = data.playlist || pl;
        const tracks = data.tracks || playlistObj.tracks || [];
        setSelectedPlaylist({ ...playlistObj, tracks });
      } else {
        setSelectedPlaylist({ ...pl, tracks: pl.tracks || [] });
      }
    } catch (err) {
      setSelectedPlaylist({ ...pl, tracks: pl.tracks || [] });
    }
  };

  const handleCoverUploadForPlaylist = async (e, playlistId) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const formData = new FormData();
      formData.append('cover', file);

      const res = await fetch(`/api/playlists/${playlistId}/cover`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedPlaylist((prev) => ({
          ...(data.playlist || prev),
          tracks: prev?.tracks || data.tracks || []
        }));
        fetchLibraryData();
      }
    } catch (err) {
      console.error('Error uploading cover art:', err);
    }
  };

  const handleCreatePlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      const formData = new FormData();
      formData.append('name', newPlaylistName.trim());
      if (newPlaylistCoverFile) {
        formData.append('cover', newPlaylistCoverFile);
      }

      const res = await fetch('/api/playlists', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      if (res.ok) {
        setNewPlaylistName('');
        setNewPlaylistCoverFile(null);
        setNewPlaylistCoverPreview(null);
        setShowCreateModal(false);
        fetchLibraryData();
      }
    } catch (err) {
      console.error('Error creating playlist:', err);
    }
  };

  const handleDeletePlaylist = async (playlistId) => {
    if (!window.confirm('Are you sure you want to delete this playlist?')) return;
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) {
        setSelectedPlaylist(null);
        fetchLibraryData();
      }
    } catch (err) {
      console.error('Error deleting playlist:', err);
    }
  };

  // Sub-view: Album Detail View
  if (selectedAlbum) {
    return (
      <div className="mobile-library animate-fade-in" style={{ padding: '1.25rem' }}>
        <button
          onClick={() => setSelectedAlbum(null)}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--glass-border-hover)',
            borderRadius: 'var(--radius-pill)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.45rem 1rem',
            cursor: 'pointer',
            marginBottom: '1.25rem',
            fontWeight: 700,
            fontSize: '0.85rem'
          }}
        >
          <IconChevronLeft size={18} color="#ffffff" />
          <span>Back to Library</span>
        </button>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ width: '84px', height: '84px', borderRadius: 'var(--radius-md)', overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)' }}>
            {selectedAlbum.firstTrackId ? (
              <img
                src={`/api/tracks/${selectedAlbum.firstTrackId}/art`}
                alt={selectedAlbum.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconDisc size={36} color="var(--accent-primary)" />
              </div>
            )}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="explore-title" style={{ fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedAlbum.name}</h1>
            <p className="explore-subtitle" style={{ fontSize: '0.8rem' }}>{selectedAlbum.artist} • {selectedAlbum.tracks.length} {selectedAlbum.tracks.length === 1 ? 'song' : 'songs'}</p>
            <button
              className="btn-primary"
              style={{ marginTop: '0.6rem', padding: '0.35rem 1rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              onClick={() => playTrack(selectedAlbum.tracks[0], selectedAlbum.tracks)}
            >
              <IconPlay size={14} color="#000000" fill="#000000" />
              Play Album
            </button>
          </div>
        </div>

        <div className="quick-picks-list">
          {selectedAlbum.tracks.map((track, idx) => (
            <div
              key={track.id}
              className="quick-pick-row"
              onClick={() => playTrack(track, selectedAlbum.tracks)}
              style={{ cursor: 'pointer' }}
            >
              <div className="row-main-info">
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-muted)', width: '20px' }}>{idx + 1}</span>
                <div className="row-text">
                  <span className="row-title" style={{ color: '#ffffff' }}>{track.title}</span>
                  <span className="row-artist">{track.artist}</span>
                </div>
              </div>
              <IconPlay size={16} color="var(--accent-primary)" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sub-view: Artist Detail View
  if (selectedArtist) {
    const tracksList = Array.isArray(allTracks) ? allTracks : (allTracks?.tracks || []);
    const artistTracks = tracksList.filter((t) =>
      (t.artist || '').toLowerCase().includes((selectedArtist.artist || '').toLowerCase())
    );
    const artistAlbums = albums.filter((alb) =>
      (alb.artist || '').toLowerCase().includes((selectedArtist.artist || '').toLowerCase())
    );

    return (
      <div className="mobile-library animate-fade-in" style={{ padding: '1.25rem' }}>
        <button
          onClick={() => {
            setSelectedArtist(null);
            setSelectedArtistForView(null);
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--glass-border-hover)',
            borderRadius: 'var(--radius-pill)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.45rem 1rem',
            cursor: 'pointer',
            marginBottom: '1.25rem',
            fontWeight: 700,
            fontSize: '0.85rem'
          }}
        >
          <IconChevronLeft size={18} color="#ffffff" />
          <span>Back to Library</span>
        </button>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div className="artist-avatar-ring" style={{ width: '84px', height: '84px', flexShrink: 0 }}>
            {selectedArtist.artist_image_path ? (
              <img
                src={`/api/tracks/artist-image/${encodeURIComponent(selectedArtist.artist)}`}
                alt={selectedArtist.artist}
                className="artist-avatar-img"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="artist-avatar-fallback" style={{ fontSize: '1.8rem' }}>
                {selectedArtist.artist ? selectedArtist.artist.charAt(0).toUpperCase() : 'A'}
              </div>
            )}
          </div>
          <div>
            <h1 className="explore-title" style={{ fontSize: '1.35rem' }}>{selectedArtist.artist}</h1>
            <p className="explore-subtitle">{artistTracks.length} {artistTracks.length === 1 ? 'song' : 'songs'} • {artistAlbums.length} {artistAlbums.length === 1 ? 'album' : 'albums'}</p>
          </div>
        </div>

        {artistTracks.length > 0 && (
          <div className="quick-picks-list">
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#fff', marginBottom: '0.5rem' }}>Popular Songs</h3>
            {artistTracks.map((track) => (
              <div
                key={track.id}
                className="quick-pick-row"
                onClick={() => playTrack(track, artistTracks)}
                style={{ cursor: 'pointer' }}
              >
                <div className="row-main-info">
                  {track.cover_art_path ? (
                    <img
                      src={`/api/tracks/${track.id}/art`}
                      alt={track.title}
                      className="row-art"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="row-art-fallback">
                      <IconMusic size={22} color="var(--accent-primary)" />
                    </div>
                  )}
                  <div className="row-text">
                    <span className="row-title" style={{ color: '#ffffff' }}>{track.title}</span>
                    <span className="row-artist">{track.album || 'Single'}</span>
                  </div>
                </div>
                <IconPlay size={16} color="var(--accent-primary)" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Sub-view: Playlist Detail View
  if (selectedPlaylist) {
    return (
      <div className="mobile-library animate-fade-in" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <button
            onClick={() => setSelectedPlaylist(null)}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid var(--glass-border-hover)',
              borderRadius: 'var(--radius-pill)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.45rem 1rem',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.85rem'
            }}
          >
            <IconChevronLeft size={18} color="#ffffff" />
            <span>Back to Library</span>
          </button>

          <button
            onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-pill)',
              color: '#ef4444',
              padding: '0.4rem 0.85rem',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.78rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <IconTrash size={14} color="#ef4444" />
            Delete
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ position: 'relative', width: '84px', height: '84px', flexShrink: 0 }}>
            <PlaylistCover playlist={selectedPlaylist} tracks={selectedPlaylist.tracks || []} size={84} />
            <label
              htmlFor={`cover-upload-${selectedPlaylist.id}`}
              style={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0,0,0,0.5)'
              }}
              title="Upload custom cover art"
            >
              <IconImage size={14} color="#000000" />
            </label>
            <input
              id={`cover-upload-${selectedPlaylist.id}`}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleCoverUploadForPlaylist(e, selectedPlaylist.id)}
            />
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="explore-title" style={{ fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedPlaylist.name}
            </h1>
            <p className="explore-subtitle" style={{ fontSize: '0.8rem' }}>
              {selectedPlaylist.tracks?.length || 0} {(selectedPlaylist.tracks?.length || 0) === 1 ? 'song' : 'songs'}
            </p>
            {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 && (
              <button
                className="btn-primary"
                style={{ marginTop: '0.6rem', padding: '0.35rem 1rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => playTrack(selectedPlaylist.tracks[0], selectedPlaylist.tracks)}
              >
                <IconPlay size={14} color="#000000" fill="#000000" />
                Play Playlist
              </button>
            )}
          </div>
        </div>

        {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 ? (
          <div className="quick-picks-list">
            {selectedPlaylist.tracks.map((track) => (
              <div
                key={track.id}
                className="quick-pick-row"
                onClick={() => playTrack(track, selectedPlaylist.tracks)}
                style={{ cursor: 'pointer' }}
              >
                <div className="row-main-info">
                  {track.cover_art_path ? (
                    <img
                      src={`/api/tracks/${track.id}/art`}
                      alt={track.title}
                      className="row-art"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="row-art-fallback">
                      <IconMusic size={22} color="var(--accent-primary)" />
                    </div>
                  )}
                  <div className="row-text">
                    <span className="row-title" style={{ color: '#ffffff' }}>{track.title}</span>
                    <span className="row-artist">{track.artist}</span>
                  </div>
                </div>
                <IconPlay size={16} color="var(--accent-primary)" />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0', fontSize: '0.88rem' }}>
            No tracks in this playlist yet.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mobile-library animate-fade-in" style={{ padding: '0 0 2.5rem 0' }}>
      {/* Header Row with View Mode Toggle & Create Playlist Action */}
      <div style={{ padding: '0.75rem 1.25rem 0.5rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="explore-title">Your Library</h1>
          <p className="explore-subtitle">Playlists, saved tracks, albums & artists</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Grid vs List View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <IconGrid size={16} />
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <IconList size={16} />
            </button>
          </div>

          <button
            className="chip-btn active"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            onClick={() => setShowCreateModal(true)}
          >
            <IconPlus size={14} color="#000000" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Quick Filter Chips */}
      <div className="quick-filter-bar">
        <button
          className={`quick-filter-chip ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          ✨ All Items
        </button>
        <button
          className={`quick-filter-chip ${activeTab === 'playlists' ? 'active' : ''}`}
          onClick={() => setActiveTab('playlists')}
        >
          🎵 Playlists ({playlists.length})
        </button>
        <button
          className={`quick-filter-chip ${activeTab === 'albums' ? 'active' : ''}`}
          onClick={() => setActiveTab('albums')}
        >
          💿 Albums ({albums.length})
        </button>
        <button
          className={`quick-filter-chip ${activeTab === 'artists' ? 'active' : ''}`}
          onClick={() => setActiveTab('artists')}
        >
          🎤 Artists ({artists.length})
        </button>
        <button
          className={`quick-filter-chip ${activeTab === 'liked' ? 'active' : ''}`}
          onClick={() => setActiveTab('liked')}
        >
          ❤️ Liked ({likedTracks.length})
        </button>
      </div>

      {/* Pinned & Recents Row */}
      <section className="section-container" style={{ marginBottom: '1.25rem' }}>
        <div className="section-title-row">
          <h2 className="section-title">Pinned & Quick Access</h2>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Top favorites</span>
        </div>

        <div className="pinned-recents-row">
          {/* Liked Songs Pinned Card */}
          <div
            className="pinned-recent-card"
            style={{
              background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.25), rgba(139, 92, 246, 0.25))',
              borderColor: 'rgba(236, 72, 153, 0.4)'
            }}
            onClick={() => setActiveTab('liked')}
          >
            <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-sm)', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <IconHeart size={20} color="#ffffff" fill="#ffffff" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h4 className="pinned-card-title">Liked Songs</h4>
              <p className="pinned-card-sub">{likedTracks.length} saved</p>
            </div>
          </div>

          {/* First 3 Playlists Pinned */}
          {playlists.slice(0, 3).map((pl) => (
            <div key={pl.id} className="pinned-recent-card" onClick={() => openPlaylist(pl)}>
              <PlaylistCover playlist={pl} size={42} />
              <div style={{ minWidth: 0 }}>
                <h4 className="pinned-card-title">{pl.name}</h4>
                <p className="pinned-card-sub">{pl.track_count || pl.tracks?.length || 0} songs</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Main Content Area (Grid vs. List View rendering) */}

      {/* Liked Songs Hero / Track List */}
      {activeTab === 'liked' && (
        <section className="section-container" style={{ marginBottom: '1.25rem' }}>
          <div
            className="liked-songs-hero-banner"
            onClick={() => {
              if (likedTracks.length > 0) playTrack(likedTracks[0], likedTracks);
            }}
          >
            <div className="liked-hero-left">
              <div className="liked-hero-heart-badge">
                <IconHeart size={26} color="#ffffff" fill="#ffffff" />
              </div>
              <div>
                <h2 className="liked-hero-title">Liked Songs</h2>
                <p className="liked-hero-sub">{likedTracks.length} saved {likedTracks.length === 1 ? 'song' : 'songs'}</p>
              </div>
            </div>
            <div className="hero-play-fab" style={{ position: 'relative', inset: 'auto' }}>
              <IconPlay size={20} color="#000000" fill="#000000" style={{ marginLeft: '2px' }} />
            </div>
          </div>

          {activeTab === 'liked' && (
            <div className="quick-picks-list" style={{ marginTop: '0.75rem' }}>
              {likedTracks.map((track) => (
                <div
                  key={track.id}
                  className="quick-pick-row"
                  onClick={() => playTrack(track, likedTracks)}
                >
                  <div className="row-main-info">
                    {track.cover_art_path ? (
                      <img
                        src={`/api/tracks/${track.id}/art`}
                        alt={track.title}
                        className="row-art"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="row-art-fallback">
                        <IconMusic size={22} color="var(--accent-primary)" />
                      </div>
                    )}
                    <div className="row-text">
                      <span className="row-title">{track.title}</span>
                      <span className="row-artist">{track.artist}</span>
                    </div>
                  </div>
                  <IconHeart size={18} color="var(--accent-primary)" fill="var(--accent-primary)" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Playlists Section */}
      {(activeTab === 'all' || activeTab === 'playlists') && (
        <section className="section-container" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title-row">
            <h2 className="section-title">Playlists</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{playlists.length} playlists</span>
          </div>

          {playlists.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="playlist-glass-grid">
                {playlists.map((pl) => (
                  <div
                    key={pl.id}
                    className="playlist-glass-card"
                    onClick={() => openPlaylist(pl)}
                  >
                    <PlaylistCover playlist={pl} size={48} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h3 className="playlist-card-name">{pl.name}</h3>
                      <p className="playlist-card-count">{(pl.track_count || pl.tracks?.length || 0)} {(pl.track_count || pl.tracks?.length) === 1 ? 'song' : 'songs'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                {playlists.map((pl) => (
                  <div key={pl.id} className="compact-list-row" onClick={() => openPlaylist(pl)}>
                    <div className="compact-list-info">
                      <PlaylistCover playlist={pl} size={44} />
                      <div style={{ minWidth: 0 }}>
                        <h4 className="compact-list-title">{pl.name}</h4>
                        <p className="compact-list-sub">Playlist • {(pl.track_count || pl.tracks?.length || 0)} songs</p>
                      </div>
                    </div>
                    <IconChevronRight size={18} color="var(--text-muted)" />
                  </div>
                ))}
              </div>
            )
          ) : (
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-md)', padding: '1.25rem', textAlign: 'center', border: '1px dashed var(--glass-border)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No playlists created yet.</p>
            </div>
          )}
        </section>
      )}

      {/* Albums Section */}
      {(activeTab === 'all' || activeTab === 'albums') && albums.length > 0 && (
        <section className="section-container" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title-row">
            <h2 className="section-title">Albums</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</span>
          </div>

          {viewMode === 'grid' ? (
            <div className="horizontal-card-list">
              {albums.map((alb, idx) => (
                <div
                  key={`${alb.name}-${idx}`}
                  className="media-card"
                  style={{ width: '120px' }}
                  onClick={() => setSelectedAlbum(alb)}
                >
                  <div className="media-card-art-box" style={{ width: '120px', height: '120px', borderRadius: 'var(--radius-md)' }}>
                    {alb.firstTrackId ? (
                      <img
                        src={`/api/tracks/${alb.firstTrackId}/art`}
                        alt={alb.name}
                        className="media-card-art"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : null}
                    <div
                      style={{
                        display: alb.firstTrackId ? 'none' : 'flex',
                        position: 'absolute',
                        inset: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(255,255,255,0.06)'
                      }}
                    >
                      <IconDisc size={32} color="var(--accent-primary)" />
                    </div>
                    {alb.tracks && alb.tracks.length > 0 && (
                      <span className="album-count-badge" style={{ fontSize: '0.62rem', padding: '1px 6px' }}>{alb.tracks.length} {alb.tracks.length === 1 ? 'track' : 'tracks'}</span>
                    )}
                    <div
                      className="media-card-play-hover"
                      style={{ width: '30px', height: '30px' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (alb.tracks && alb.tracks.length > 0) {
                          playTrack(alb.tracks[0], alb.tracks);
                        }
                      }}
                      title="Play Album"
                    >
                      <IconPlay size={14} color="#000000" fill="#000000" style={{ marginLeft: '2px' }} />
                    </div>
                  </div>
                  <span className="media-card-title" style={{ fontSize: '0.82rem' }}>{alb.name}</span>
                  <span className="media-card-sub" style={{ fontSize: '0.72rem' }}>{alb.artist}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {albums.map((alb, idx) => (
                <div key={`${alb.name}-${idx}`} className="compact-list-row" onClick={() => setSelectedAlbum(alb)}>
                  <div className="compact-list-info">
                    {alb.firstTrackId ? (
                      <img
                        src={`/api/tracks/${alb.firstTrackId}/art`}
                        alt={alb.name}
                        className="compact-list-art"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="row-art-fallback" style={{ width: 44, height: 44 }}>
                        <IconDisc size={22} color="var(--accent-primary)" />
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <h4 className="compact-list-title">{alb.name}</h4>
                      <p className="compact-list-sub">{alb.artist} • {alb.tracks.length} tracks</p>
                    </div>
                  </div>
                  <IconChevronRight size={18} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Artists Section */}
      {(activeTab === 'all' || activeTab === 'artists') && artists.length > 0 && (
        <section className="section-container">
          <div className="section-title-row">
            <h2 className="section-title">Artists</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{artists.length} artists</span>
          </div>

          {viewMode === 'grid' ? (
            <div className="artist-circle-list">
              {artists.map((art, idx) => (
                <div
                  key={`${art.artist}-${idx}`}
                  className="artist-circle-item"
                  onClick={() => setSelectedArtist(art)}
                >
                  <div className="artist-avatar-ring">
                    {art.artist_image_path ? (
                      <img
                        src={`/api/tracks/artist-image/${encodeURIComponent(art.artist)}`}
                        alt={art.artist}
                        className="artist-avatar-img"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="artist-avatar-fallback">
                        {art.artist ? art.artist.charAt(0).toUpperCase() : 'A'}
                      </div>
                    )}
                  </div>
                  <span className="artist-circle-name">{art.artist}</span>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {artists.map((art, idx) => (
                <div key={`${art.artist}-${idx}`} className="compact-list-row" onClick={() => setSelectedArtist(art)}>
                  <div className="compact-list-info">
                    <div className="artist-avatar-ring" style={{ width: 44, height: 44 }}>
                      {art.artist_image_path ? (
                        <img
                          src={`/api/tracks/artist-image/${encodeURIComponent(art.artist)}`}
                          alt={art.artist}
                          className="artist-avatar-img"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div className="artist-avatar-fallback" style={{ fontSize: '1rem' }}>
                          {art.artist ? art.artist.charAt(0).toUpperCase() : 'A'}
                        </div>
                      )}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h4 className="compact-list-title">{art.artist}</h4>
                      <p className="compact-list-sub">Artist</p>
                    </div>
                  </div>
                  <IconChevronRight size={18} color="var(--text-muted)" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="modal-overlay animate-fade-in" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content animate-slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '380px', width: '90%' }}>
            <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <IconListPlus size={20} color="var(--accent-primary)" />
              Create Playlist
            </h2>
            <form onSubmit={handleCreatePlaylist}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <div style={{ position: 'relative', width: 96, height: 96, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'rgba(255,255,255,0.06)', border: '1px dashed var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {newPlaylistCoverPreview ? (
                    <img src={newPlaylistCoverPreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <IconImage size={32} color="var(--text-muted)" />
                  )}
                  <label
                    htmlFor="modal-cover-input"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: newPlaylistCoverPreview ? 'rgba(0,0,0,0.3)' : 'transparent'
                    }}
                  >
                    {!newPlaylistCoverPreview && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 700, marginTop: '2.2rem' }}>Upload Cover</span>
                    )}
                  </label>
                  <input
                    id="modal-cover-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setNewPlaylistCoverFile(file);
                        setNewPlaylistCoverPreview(URL.createObjectURL(file));
                      }
                    }}
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="Playlist Title"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="explore-search-input"
                style={{
                  width: '100%',
                  margin: '0 0 1.25rem 0',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem'
                }}
                autoFocus
              />

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="chip-btn"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="chip-btn active"
                  disabled={!newPlaylistName.trim()}
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
