import React from 'react';
import { X, LogOut, User, Shield, Music, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export function AccountModal({ isOpen, onClose }) {
  const { user, logout } = useAuth();

  if (!isOpen || !user) return null;

  const displayName = user.displayName || user.username || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#181818] rounded-3xl p-6 border border-white/10 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-yt-subtext uppercase tracking-wider">Account</span>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white transition-colors"
            aria-label="Close Account Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Card */}
        <div className="flex items-center space-x-4 p-4 rounded-2xl bg-neutral-900/80 border border-white/5">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-neutral-800 ring-2 ring-white/20 flex items-center justify-center text-xl font-bold text-white shadow-lg flex-shrink-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              initial
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white truncate">{displayName}</h2>
            <p className="text-xs text-yt-subtext truncate">@{user.username}</p>
            <div className="flex items-center space-x-1 text-[10px] text-emerald-400 font-semibold mt-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Session Active</span>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/40 text-xs">
            <span className="text-neutral-400">User ID</span>
            <span className="font-mono text-white">{user.id}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/40 text-xs">
            <span className="text-neutral-400">Platform</span>
            <span className="font-medium text-white">LocalTune Mobile V3</span>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2">
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-red-950/60 hover:bg-red-900/80 border border-red-800/40 text-red-300 text-xs font-bold transition-colors shadow-md"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
