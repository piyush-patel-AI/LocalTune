import React from 'react';
import { AuthProvider } from './context/AuthContext.jsx';
import { PlayerProvider, usePlayer } from './context/PlayerContext.jsx';
import { HomeScreen } from './screens/HomeScreen.jsx';
import { ExploreScreen } from './screens/ExploreScreen.jsx';
import { LibraryScreen } from './screens/LibraryScreen.jsx';
import { SearchScreen } from './screens/SearchScreen.jsx';
import { MiniPlayer } from './components/MiniPlayer.jsx';
import { ExpandedPlayer } from './components/ExpandedPlayer.jsx';
import { BottomNavigation } from './components/BottomNavigation.jsx';

function MainLayout() {
  const { activeTab } = usePlayer();

  return (
    <div className="w-full max-w-md min-h-screen flex flex-col bg-[#030303] text-white relative shadow-2xl overflow-x-hidden border-x border-neutral-900 mx-auto select-none">
      {/* Seamless Ambient Top Gradient Mesh */}
      <div className="absolute top-0 left-0 right-0 h-56 top-ambient-mesh pointer-events-none z-0" />

      {/* Top Mobile Status Bar */}
      <div className="relative h-9 px-6 pt-2 flex items-center justify-between text-[11px] font-semibold text-neutral-300 z-50 bg-transparent">
        <span>6:11</span>
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px]">5G</span>
          <div className="w-5 h-2.5 border border-white/70 rounded-[2px] p-[1px] flex items-center">
            <div className="h-full bg-white w-[50%] rounded-[1px]" />
          </div>
        </div>
      </div>

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

export function App() {
  return (
    <AuthProvider>
      <PlayerProvider>
        <MainLayout />
      </PlayerProvider>
    </AuthProvider>
  );
}

export default App;
