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
  IconImage
} from '../components/Icons';

export default function MobileLibraryView() {
  const { playTrack, favoritesMap } = usePlayer();
  const [activeTab, setActiveTab] = useState('all'); // all | playlists | albums | artists | liked
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

  const [newPlaylistCoverFile, setNewPlaylistCoverFile] = useState(null);
  const [newPlaylistCoverPreview, setNewPlaylistCoverPreview] = useState(null);

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
            <p className="explore-subtitle" style={{ fontSize: '0.8rem' }}>{selectedAlbum.artist} • {selectedAlbum.tracks.length} songs</p>
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
            >
              <div className="row-main-info">
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', width: '20px', textAlign: 'center' }}>{idx + 1}</span>
                <div className="row-text">
                  <span className="row-title">{track.title}</span>
                  <span className="row-artist">{track.artist}</span>
                </div>
              </div>
              <IconPlay size={18} color="var(--text-secondary)" fill="var(--text-secondary)" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Sub-view: Artist Detail View
  if (selectedArtist) {
    const tracksList = Array.isArray(allTracks) ? allTracks : (allTracks?.tracks || []);
    const artistTracks = tracksList.filter((t) => t.artist === selectedArtist.artist);
    const artistAlbums = Array.from(new Set(artistTracks.map((t) => t.album || 'Unknown Album')));

    return (
      <div className="mobile-library animate-fade-in" style={{ padding: '1.25rem' }}>
        <button
          onClick={() => setSelectedArtist(null)}
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div className="artist-avatar-ring" style={{ width: '80px', height: '80px', flexShrink: 0 }}>
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
            <p className="explore-subtitle">{artistTracks.length} songs • {artistAlbums.length} albums</p>
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
                      <IconMusic size={20} color="var(--accent-primary)" />
                    </div>
                  )}
                  <div className="row-text">
                    <span className="row-title">{track.title}</span>
                    <span className="row-artist">{track.album || 'Single'}</span>
                  </div>
                </div>
                <IconPlay size={18} color="var(--text-secondary)" fill="var(--text-secondary)" />
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
            marginBottom: '1.25rem',
            fontWeight: 700,
            fontSize: '0.85rem'
          }}
        >
          <IconChevronLeft size={18} color="#ffffff" />
          <span>Back to Library</span>
        </button>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
          <label
            style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
            title="Click to upload custom cover art"
          >
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => handleCoverUploadForPlaylist(e, selectedPlaylist.id)}
            />
            <PlaylistCover playlist={selectedPlaylist} tracks={selectedPlaylist.tracks || []} size={84} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = 0)}
            >
              <IconImage size={24} color="#fff" />
            </div>
          </label>

          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 className="explore-title" style={{ fontSize: '1.15rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedPlaylist.name}
            </h1>
            <p className="explore-subtitle" style={{ fontSize: '0.8rem' }}>
              {selectedPlaylist.tracks?.length || 0} songs
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

          <button
            className="icon-btn"
            onClick={() => handleDeletePlaylist(selectedPlaylist.id)}
            title="Delete Playlist"
          >
            <IconTrash size={18} color="#ef4444" />
          </button>
        </div>

        {selectedPlaylist.tracks && selectedPlaylist.tracks.length > 0 ? (
          <div className="quick-picks-list">
            {selectedPlaylist.tracks.map((track) => (
              <div
                key={track.id}
                className="quick-pick-row"
                onClick={() => playTrack(track, selectedPlaylist.tracks)}
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
                <IconPlay size={18} color="var(--text-secondary)" fill="var(--text-secondary)" />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            No tracks in this playlist yet.
          </div>
        )}
      </div>
    );
  }

  // Main Library View
  return (
    <div className="mobile-library animate-fade-in" style={{ padding: '0 0 2rem 0' }}>
      {/* Header Banner */}
      <div className="explore-banner" style={{ margin: '0.75rem 1.25rem 1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 className="explore-title">Your Library</h1>
            <p className="explore-subtitle">Playlists, albums, saved favorites, and artists.</p>
          </div>
          <button
            className="icon-btn"
            onClick={() => setShowCreateModal(true)}
            title="Create Playlist"
          >
            <IconPlus size={20} color="#ffffff" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="chips-container" style={{ marginBottom: '1.25rem' }}>
        {['all', 'playlists', 'albums', 'artists', 'liked'].map((tab) => (
          <button
            key={tab}
            className={`chip-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Liked Songs Hero Banner (Shown in 'all' or 'liked') */}
      {(activeTab === 'all' || activeTab === 'liked') && (
        <div className="section-container" style={{ paddingBottom: '1rem' }}>
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
                <p className="liked-hero-sub">{likedTracks.length} saved songs</p>
              </div>
            </div>
            <div className="hero-play-fab" style={{ position: 'relative', inset: 'auto' }}>
              <IconPlay size={20} color="#000000" fill="#000000" style={{ marginLeft: '2px' }} />
            </div>
          </div>

          {activeTab === 'liked' && (
            <div className="quick-picks-list">
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
        </div>
      )}

      {/* Playlists Glass Grid */}
      {(activeTab === 'all' || activeTab === 'playlists') && (
        <section className="section-container">
          <div className="section-title-row">
            <h2 className="section-title">Playlists</h2>
            <button
              style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
              onClick={() => setShowCreateModal(true)}
            >
              + Create
            </button>
          </div>

          {playlists.length > 0 ? (
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
                    <p className="playlist-card-count">{pl.track_count || pl.tracks?.length || 0} songs</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', borderRadius: 'var(--radius-md)', padding: '1.25rem', textAlign: 'center', border: '1px dashed var(--glass-border)' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>No playlists created yet.</p>
              <button
                className="chip-btn active"
                style={{ marginTop: '0.75rem' }}
                onClick={() => setShowCreateModal(true)}
              >
                Create Your First Playlist
              </button>
            </div>
          )}
        </section>
      )}

      {/* Albums Horizontal Carousel */}
      {(activeTab === 'all' || activeTab === 'albums') && albums.length > 0 && (
        <section className="section-container" style={{ marginTop: '1.25rem' }}>
          <div className="section-title-row">
            <h2 className="section-title">Albums</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{albums.length} albums</span>
          </div>

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
                    <span className="album-count-badge" style={{ fontSize: '0.62rem', padding: '1px 6px' }}>{alb.tracks.length} tracks</span>
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
        </section>
      )}

      {/* Artists Grid */}
      {(activeTab === 'all' || activeTab === 'artists') && artists.length > 0 && (
        <section className="section-container" style={{ marginTop: '1.5rem' }}>
          <div className="section-title-row">
            <h2 className="section-title">Artists</h2>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{artists.length} artists</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem' }}>
            {artists.map((art, idx) => (
              <div
                key={`${art.artist}-${idx}`}
                onClick={() => setSelectedArtist(art)}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <div className="artist-avatar-ring" style={{ width: '56px', height: '56px', flexShrink: 0 }}>
                  {art.artist_image_path ? (
                    <img
                      src={`/api/tracks/artist-image/${encodeURIComponent(art.artist)}`}
                      alt={art.artist}
                      className="artist-avatar-img"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="artist-avatar-fallback" style={{ fontSize: '1.2rem' }}>
                      {art.artist ? art.artist.charAt(0).toUpperCase() : 'A'}
                    </div>
                  )}
                </div>
                <div style={{ overflow: 'hidden', flex: 1 }}>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {art.artist}
                  </h4>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Artist</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className="mobile-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="mobile-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h2 className="sheet-title">Create Playlist</h2>
              <button className="sheet-close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreatePlaylist} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                <label
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '10px',
                    border: '1px dashed var(--glass-border-hover)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    flexShrink: 0
                  }}
                  title="Upload cover art"
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        setNewPlaylistCoverFile(file);
                        const reader = new FileReader();
                        reader.onload = (evt) => setNewPlaylistCoverPreview(evt.target.result);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  {newPlaylistCoverPreview ? (
                    <img src={newPlaylistCoverPreview} alt="Cover Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <IconImage size={24} color="var(--text-secondary)" />
                  )}
                </label>

                <input
                  type="text"
                  placeholder="Playlist Title"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  autoFocus
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid var(--glass-border-hover)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.85rem 1rem',
                    color: '#ffffff',
                    outline: 'none',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

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
