import React, { useState } from 'react';
import { Music, Lock, User, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export function LoginScreen() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await register(username.trim(), password, displayName.trim());
      } else {
        await login(username.trim(), password);
      }
    } catch (err) {
      setError(err.message || (isRegister ? 'Registration failed' : 'Invalid username or password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md min-h-screen flex flex-col justify-center px-6 py-12 bg-[#030303] text-white relative overflow-hidden mx-auto select-none">
      {/* Ambient Background Gradient Mesh */}
      <div className="absolute top-0 left-0 right-0 h-72 top-ambient-mesh pointer-events-none z-0" />

      {/* Card Container */}
      <div className="relative z-10 bg-neutral-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl p-7 shadow-2xl space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-yt-red flex items-center justify-center shadow-xl shadow-red-950/60 ring-1 ring-white/20">
            <Music className="w-8 h-8 text-white fill-current" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center">
              Local<span className="text-neutral-400 font-normal ml-0.5">Tune</span>
            </h1>
            <p className="text-xs text-yt-subtext mt-1 font-medium">
              {isRegister ? 'Create an account to start streaming' : 'Sign in to your music library'}
            </p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-black/50 p-1 rounded-full border border-white/10">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${
              !isRegister ? 'bg-white text-black shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-full transition-all ${
              isRegister ? 'bg-white text-black shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center space-x-2 p-3 rounded-xl bg-red-950/60 border border-red-800/40 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1.5">Username</label>
            <div className="relative flex items-center">
              <User className="absolute left-3.5 w-4 h-4 text-neutral-500" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-neutral-400 mb-1.5">
                Display Name <span className="text-neutral-500 font-normal">(Optional)</span>
              </label>
              <div className="relative flex items-center">
                <Sparkles className="absolute left-3.5 w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-white/30"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-400 mb-1.5">Password</label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-neutral-500" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-950 border border-white/10 text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-full bg-white text-black text-sm font-bold shadow-lg hover:bg-neutral-200 active:scale-[0.98] transition-all disabled:opacity-50 mt-2"
          >
            {loading ? (isRegister ? 'Creating Account...' : 'Signing In...') : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
