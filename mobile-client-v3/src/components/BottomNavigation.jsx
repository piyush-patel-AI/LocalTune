import React from 'react';
import { Home, Compass, Library, Search } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext.jsx';

export function BottomNavigation() {
  const { activeTab, setActiveTab } = usePlayer();

  const NAV_ITEMS = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'explore', label: 'Explore', icon: Compass },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'search', label: 'Search', icon: Search },
  ];

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#0f0f0f]/95 backdrop-blur-md border-t border-neutral-900 px-4 py-2 flex items-center justify-around z-30"
      data-purpose="bottom-navigation"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`flex flex-col items-center justify-center space-y-1 py-1 px-3 rounded-xl transition-colors ${
              isActive ? 'text-white font-bold' : 'text-neutral-500 hover:text-neutral-300 font-medium'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5px]' : 'stroke-[1.75px]'}`} />
            <span className="text-[10px] tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
