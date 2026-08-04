import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import MobileHomeView from './views/MobileHomeView';
import MobileExploreView from './views/MobileExploreView';
import MobileLibraryView from './views/MobileLibraryView';
import MobileSearchView from './views/MobileSearchView';
import MobileSettingsView from './views/MobileSettingsView';
import MobileLoginView from './components/MobileLoginView';
import NowPlayingModal from './components/NowPlayingModal';
import QueueModal from './components/QueueModal';
import UserProfileModal from './components/UserProfileModal';
import AddToPlaylistModal from './components/AddToPlaylistModal';
import {
  IconSearch,
  IconPlay,
  IconPause,
  IconHome,
  IconExplore,
  IconLibrary,
  IconMusic,
  IconPlus,
  IconHeart,
  IconQueue
} from './components/Icons';

function AppContent() {
  const { user, loading } = useAuth();
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    openNowPlaying,
    favoritesMap,
    toggleFavorite,
    openQueue
  } = usePlayer();

  const [activeTab, setActiveTab] = useState('home');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#07090e',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '1.1rem',
        fontWeight: 600
      }}>
        Loading LocalTune...
      </div>
    );
  }

  if (!user) {
    return <MobileLoginView />;
  }

  const isFav = currentTrack ? !!favoritesMap[currentTrack.id] : false;
  const userInitials = (user.displayName || user.username || 'U').slice(0, 2).toUpperCase();

  return (
    <div className="mobile-app">
      {/* Top Mobile Header */}
      <header className="mobile-header">
        <div className="header-brand">
          <img src="/logo.png" alt="LocalTune Logo" className="brand-logo-img" />
          <span className="brand-title">LocalTune</span>
        </div>

        <div className="header-actions">
          <button
            className="icon-btn"
            title="Search Catalog"
            onClick={() => setShowSearchModal(true)}
          >
            <IconSearch size={20} />
          </button>

          <div
            className="user-avatar"
            title="User Profile"
            onClick={() => setShowProfileModal(true)}
            style={{ cursor: 'pointer', overflow: 'hidden', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName || user.username}
                style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              />
            ) : (
              userInitials
            )}
          </div>
        </div>
      </header>

      {/* Main View Content */}
      <main className="mobile-content">
        {activeTab === 'home' && <MobileHomeView />}
        {activeTab === 'explore' && <MobileExploreView />}
        {activeTab === 'library' && <MobileLibraryView />}
        {activeTab === 'settings' && <MobileSettingsView />}
      </main>

      {/* Floating Mini Player */}
      {currentTrack && (
        <div className="floating-mini-player" onClick={openNowPlaying}>
          <div className="mini-info-group">
            {currentTrack.cover_art_path ? (
              <img
                src={`/api/tracks/${currentTrack.id}/art`}
                alt={currentTrack.title}
                className="mini-art"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className="mini-art-fallback">
                <IconMusic size={20} color="var(--accent-primary)" />
              </div>
            )}
            <div className="mini-text">
              <span className="mini-title">{currentTrack.title}</span>
              <span className="mini-artist">{currentTrack.artist}</span>
            </div>
          </div>

          <div className="mini-controls" onClick={(e) => e.stopPropagation()}>
            <button
              className="mini-btn"
              onClick={() => setShowAddToPlaylistModal(true)}
              title="Add to Playlist"
            >
              <IconPlus size={20} color="var(--accent-primary)" />
            </button>

            <button
              className="mini-btn"
              onClick={() => toggleFavorite(currentTrack.id)}
              title="Like / Favorite"
            >
              <IconHeart
                size={20}
                color={isFav ? 'var(--accent-primary)' : 'var(--text-secondary)'}
                fill={isFav ? 'var(--accent-primary)' : 'none'}
              />
            </button>

            <button
              className="mini-btn"
              onClick={() => openQueue()}
              title="Playing Queue"
            >
              <IconQueue size={20} color="var(--text-secondary)" />
            </button>

            <button className="mini-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <IconPause size={22} color="#ffffff" fill="#ffffff" />
              ) : (
                <IconPlay size={22} color="#ffffff" fill="#ffffff" style={{ marginLeft: '2px' }} />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Modals & Overlays */}
      <NowPlayingModal />
      <QueueModal />

      {showProfileModal && (
        <UserProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {showSearchModal && (
        <MobileSearchView onClose={() => setShowSearchModal(false)} />
      )}

      {showAddToPlaylistModal && currentTrack && (
        <AddToPlaylistModal
          track={currentTrack}
          onClose={() => setShowAddToPlaylistModal(false)}
        />
      )}

      {/* Bottom Navigation Bar */}
      <nav className="bottom-nav-bar">
        <button
          className={`nav-tab-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
        >
          <IconHome size={20} color={activeTab === 'home' ? '#ffffff' : 'var(--text-muted)'} />
          <span className="nav-tab-label">Home</span>
        </button>

        <button
          className={`nav-tab-item ${activeTab === 'explore' ? 'active' : ''}`}
          onClick={() => setActiveTab('explore')}
        >
          <IconExplore size={20} color={activeTab === 'explore' ? '#ffffff' : 'var(--text-muted)'} />
          <span className="nav-tab-label">Explore</span>
        </button>

        <button
          className={`nav-tab-item ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <IconLibrary size={20} color={activeTab === 'library' ? '#ffffff' : 'var(--text-muted)'} />
          <span className="nav-tab-label">Library</span>
        </button>

        <button
          className={`nav-tab-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <IconMusic size={20} color={activeTab === 'settings' ? '#ffffff' : 'var(--text-muted)'} />
          <span className="nav-tab-label">Settings</span>
        </button>
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <AppContent />
      </PlayerProvider>
    </AuthProvider>
  );
}
