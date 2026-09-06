import React, { useState } from 'react';
import { Bell, Search, Music } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { UserAvatar } from './UserAvatar.jsx';
import { AccountModal } from './AccountModal.jsx';

export function Header() {
  const { setActiveTab } = usePlayer();
  const { user } = useAuth();
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  return (
    <>
      <header className="relative px-4 py-2 flex items-center justify-between z-40 bg-transparent" data-purpose="app-header">
        {/* Brand Logo */}
        <div className="flex items-center space-x-2 cursor-pointer" onClick={() => setActiveTab('home')}>
          <div className="w-6 h-6 rounded-full bg-yt-red flex items-center justify-center shadow-lg shadow-red-900/40">
            <Music className="w-3.5 h-3.5 text-white fill-current" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white flex items-center">
            Local<span className="text-neutral-400 font-normal ml-0.5">Tune</span>
          </span>
        </div>

        {/* Action Buttons & Avatar */}
        <div className="flex items-center space-x-4 relative">
          <button
            aria-label="Notifications"
            className="relative p-1 text-white hover:opacity-80 transition-opacity"
            type="button"
          >
            <Bell className="w-5 h-5 text-white" />
            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold leading-none text-white transform translate-x-1/3 -translate-y-1/4 bg-yt-red rounded-full">
              3
            </span>
          </button>

          <button
            aria-label="Search"
            className="p-1 text-white hover:opacity-80 transition-opacity"
            type="button"
            onClick={() => setActiveTab('search')}
          >
            <Search className="w-5 h-5 text-white" />
          </button>

          <div
            onClick={() => setIsAccountOpen(true)}
            className="cursor-pointer rounded-full ring-1 ring-white/20 hover:ring-white/40 transition-all"
            title="User Profile"
          >
            <UserAvatar user={user} size={28} />
          </div>
        </div>
      </header>

      <AccountModal isOpen={isAccountOpen} onClose={() => setIsAccountOpen(false)} />
    </>
  );
}
