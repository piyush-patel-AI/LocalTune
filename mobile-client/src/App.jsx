import { useState, useEffect, useRef, useCallback } from 'react';
import { flushSync } from 'react-dom';
import logo from '../../Assets/logo.png';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { getArtworkUrl } from './services/MediaMetadataProvider';
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
import StartupSkeleton from './components/StartupSkeleton';
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
    closeNowPlaying,
    isNowPlayingOpen,
    openQueue,
    closeQueue,
    isQueueOpen,
    favoritesMap,
    toggleFavorite,
    selectedArtistForView,
    setSelectedArtistForView
  } = usePlayer();

  const [activeTab, setActiveTab] = useState('home');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const scrollContainerRef = useRef(null);

  useEffect(() => {
    if (selectedArtistForView) {
      setActiveTab('library');
    }
  }, [selectedArtistForView]);

  // Intercept Mobile Browser & Android Hardware Back Button
  useEffect(() => {
    if (!window.history.state || !window.history.state.localTuneRoot) {
      try { window.history.replaceState({ localTuneRoot: true }, ''); } catch (e) {}
    }

    const handlePopState = () => {
      // 1. Now Playing Modal
      if (isNowPlayingOpen) {
        closeNowPlaying();
        return;
      }
      // 2. Playing Queue Modal
      if (isQueueOpen) {
        closeQueue();
        return;
      }
      // 3. Search Modal
      if (showSearchModal) {
        setShowSearchModal(false);
        return;
      }
      // 4. User Profile Modal
      if (showProfileModal) {
        setShowProfileModal(false);
        return;
      }
      // 5. Add to Playlist Modal
      if (showAddToPlaylistModal) {
        setShowAddToPlaylistModal(false);
        return;
      }
      // 6. Selected Artist Subview
      if (selectedArtistForView) {
        setSelectedArtistForView(null);
        return;
      }
      // 7. Non-Home Navigation Tab
      if (activeTab !== 'home') {
        setActiveTab('home');
        return;
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    isNowPlayingOpen,
    isQueueOpen,
    showSearchModal,
    showProfileModal,
    showAddToPlaylistModal,
    selectedArtistForView,
    activeTab,
    closeNowPlaying,
    closeQueue,
    setSelectedArtistForView
  ]);

  const handleNavTabClick = (tab) => {
    if (activeTab !== tab) {
      try { window.history.pushState({ localTuneTab: tab }, ''); } catch (e) {}
      flushSync(() => { setActiveTab(tab); });
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    }
  };

  const handleOpenSearch = () => {
    try { window.history.pushState({ localTuneModal: 'search' }, ''); } catch (e) {}
    setShowSearchModal(true);
  };

  const handleOpenProfile = () => {
    try { window.history.pushState({ localTuneModal: 'profile' }, ''); } catch (e) {}
    setShowProfileModal(true);
  };

  const handleOpenAddToPlaylist = () => {
    try { window.history.pushState({ localTuneModal: 'addtoplaylist' }, ''); } catch (e) {}
    setShowAddToPlaylistModal(true);
  };

  if (loading) {
    return <StartupSkeleton />;
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
          <img src={logo} alt="Octave Logo" className="brand-logo-img" />
          <span className="brand-title">Octave</span>
        </div>

        <div className="header-actions">
          <button
            className="icon-btn"
            title="Search Catalog"
            onClick={handleOpenSearch}
          >
            <IconSearch size={20} />
          </button>

          <div
            className="user-avatar"
            title="User Profile"
            onClick={handleOpenProfile}
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
      <main className="mobile-content" ref={scrollContainerRef}>
        <div style={{ display: activeTab === 'home' ? 'block' : 'none' }}>
          <MobileHomeView />
        </div>
        <div style={{ display: activeTab === 'explore' ? 'block' : 'none' }}>
          <MobileExploreView />
        </div>
        <div style={{ display: activeTab === 'library' ? 'block' : 'none' }}>
          <MobileLibraryView />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'block' : 'none' }}>
          <MobileSettingsView />
        </div>
      </main>

      {/* Floating Mini Player */}
      {currentTrack && (
        <div className="floating-mini-player" onClick={openNowPlaying}>
          <div className="mini-info-group">
            <img
              src={getArtworkUrl(currentTrack, 128)}
              alt={currentTrack.title}
              className="mini-art"
              onError={(e) => { e.target.src = logo; }}
            />
            <div className="mini-text">
              <span className="mini-title">{currentTrack.title}</span>
              <span className="mini-artist">{currentTrack.artist}</span>
            </div>
          </div>

          <div className="mini-controls" onClick={(e) => e.stopPropagation()}>
            <button
              className="mini-btn"
              onClick={handleOpenAddToPlaylist}
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
          onClick={() => handleNavTabClick('home')}
        >
          <IconHome size={20} color={activeTab === 'home' ? 'var(--accent-primary)' : 'var(--text-muted)'} />
          <span className="nav-tab-label">Home</span>
        </button>

        <button
          className={`nav-tab-item ${activeTab === 'explore' ? 'active' : ''}`}
          onClick={() => handleNavTabClick('explore')}
        >
          <IconExplore size={20} color={activeTab === 'explore' ? 'var(--accent-primary)' : 'var(--text-muted)'} />
          <span className="nav-tab-label">Explore</span>
        </button>

        <button
          className={`nav-tab-item ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => handleNavTabClick('library')}
        >
          <IconLibrary size={20} color={activeTab === 'library' ? 'var(--accent-primary)' : 'var(--text-muted)'} />
          <span className="nav-tab-label">Library</span>
        </button>

        <button
          className={`nav-tab-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => handleNavTabClick('settings')}
        >
          <IconMusic size={20} color={activeTab === 'settings' ? 'var(--accent-primary)' : 'var(--text-muted)'} />
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
