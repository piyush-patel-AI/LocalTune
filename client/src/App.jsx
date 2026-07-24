import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PlayerProvider } from './context/PlayerContext';
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

import './index.css';

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
  const [activeView, setActiveView] = useState('home');
  const [showQueue, setShowQueue] = useState(false);

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
      <div className="main-layout">
        <Navbar activeView={activeView} setActiveView={setActiveView} />
        <main className="content-area">
          <MainContent activeView={activeView} />
        </main>
        {showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}
      </div>
      <PlayerBar showQueue={showQueue} setShowQueue={setShowQueue} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <AnimatedGradientBackground Breathing={true} />
        <MainApp />
      </PlayerProvider>
    </AuthProvider>
  );
}
