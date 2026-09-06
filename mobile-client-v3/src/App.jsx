import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { PlayerProvider, usePlayer } from './context/PlayerContext.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { ExploreScreen } from './screens/ExploreScreen.jsx';
import { LibraryScreen } from './screens/LibraryScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import { LoginScreen } from './screens/LoginScreen.jsx';
import { MiniPlayer } from './components/MiniPlayer.jsx';
import { ExpandedPlayer } from './components/ExpandedPlayer.jsx';
import { BottomNavigation } from './components/BottomNavigation.jsx';
import { Music } from 'lucide-react';

function MainLayout() {
  const { activeTab } = usePlayer();

  return (
    <div className="w-full max-w-md min-h-screen flex flex-col bg-[#030303] text-white relative shadow-2xl overflow-x-hidden border-x border-neutral-900 mx-auto select-none app-safe-area">
      {/* Seamless Ambient Top Gradient Mesh */}
      <div className="absolute top-0 left-0 right-0 h-56 top-ambient-mesh pointer-events-none z-0" />

      {/* Screen Router */}
      <main className="flex-1 flex flex-col relative z-10">
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'explore' && <ExploreScreen />}
        {activeTab === 'library' && <LibraryScreen />}
        {activeTab === 'search' && <SearchScreen />}
      </main>

      {/* Persistent Audio Controls & Navigation */}
      <MiniPlayer />
      <ExpandedPlayer />
      <BottomNavigation />
    </div>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="w-full max-w-md min-h-screen flex flex-col items-center justify-center bg-[#030303] text-white mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-yt-red flex items-center justify-center animate-pulse shadow-xl shadow-red-950/60">
          <Music className="w-6 h-6 text-white fill-current" />
        </div>
        <p className="text-xs text-neutral-400 font-medium mt-3">Connecting to LocalTune...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <MainLayout />;
}

export function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <AppContent />
      </PlayerProvider>
    </AuthProvider>
  );
}

export default App;
