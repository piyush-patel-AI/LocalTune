import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import Navbar from './components/Navbar';
import PlayerBar from './components/PlayerBar';
import QueuePanel from './components/QueuePanel';
import Login from './components/Login';
import AnimatedGradientBackground from './components/AnimatedGradientBackground';

import HomeView from './views/HomeView';
import LibraryView from './views/LibraryView';
import AlbumsView from './views/AlbumsView';
import ArtistsView from './views/ArtistsView';
import PlaylistsView from './views/PlaylistsView';
import FavoritesView from './views/FavoritesView';
import SearchView from './views/SearchView';
import NowPlayingOverlay from './components/NowPlayingOverlay';

import './index.css';

function AmbientGlow({ track }) {
  const [activeArt, setActiveArt] = useState(null);
  const [prevArt, setPrevArt] = useState(null);
  const [isFading, setIsFading] = useState(false);

  const currentArt = track && track.cover_art_path
    ? `/api/tracks/${track.id}/art`
    : null;

  useEffect(() => {
    if (currentArt !== activeArt) {
      setPrevArt(activeArt);
      setActiveArt(currentArt);
      setIsFading(true);

      const timer = setTimeout(() => {
        setIsFading(false);
        setPrevArt(null);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [currentArt]);

  if (!activeArt && !prevArt) return null;

  return (
    <div className="app-ambient-glow-wrapper">
      {prevArt && (
        <div
          className={`app-ambient-glow ${isFading ? 'fade-out' : ''}`}
          style={{ backgroundImage: `url(${prevArt})` }}
        />
      )}
      {activeArt && (
        <div
          className={`app-ambient-glow ${isFading ? 'fade-in' : 'visible'}`}
          style={{ backgroundImage: `url(${activeArt})` }}
        />
      )}
    </div>
  );
}

function MainContent({ activeView }) {
  switch (activeView) {
    case 'library':
      return <LibraryView />;
    case 'albums':
      return <AlbumsView />;
    case 'artists':
      return <ArtistsView />;
    case 'playlists':
      return <PlaylistsView />;
    case 'favorites':
      return <FavoritesView />;
    case 'search':
      return <SearchView />;
    case 'home':
    default:
      return <HomeView />;
  }
}

function MainApp() {
  const { user, loading } = useAuth();
  const { currentTrack } = usePlayer();
  const [activeView, setActiveView] = useState('home');
  const [showQueue, setShowQueue] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  if (loading) {
    return (
      <div className="login-container">
        <div style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Loading LocalTune...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app-container">
      {/* Dynamic ambient cross-fading background glow */}
      <AmbientGlow track={currentTrack} />

      <div className="main-layout">
        <Navbar activeView={activeView} setActiveView={setActiveView} />
        <main className="content-area">
          <MainContent activeView={activeView} />
        </main>
        {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}
      </div>
      <PlayerBar
        showQueue={showQueue}
        setShowQueue={setShowQueue}
        onToggleNowPlaying={() => setShowNowPlaying((prev) => !prev)}
      />
      {showNowPlaying && (
        <NowPlayingOverlay onClose={() => setShowNowPlaying(false)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <AnimatedGradientBackground />
        <MainApp />
      </PlayerProvider>
    </AuthProvider>
  );
}
