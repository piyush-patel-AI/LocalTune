import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, clearSessionToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const checkAuth = async () => {
    try {
      const data = await api.getMe();
      if (data.user) {
        setUser(data.user);
        setAuthError(null);
        return data.user;
      } else {
        setUser(null);
        return null;
      }
    } catch (_) {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const login = async (username, password) => {
    // Step 1: Call login endpoint (sets cookie + returns sessionToken)
    const res = await api.login(username, password);

    if (res.user) {
      setUser(res.user);
      setAuthError(null);

      // Step 2: Immediately verify session is live via /api/me
      // This catches WebView environments where the cookie was not stored
      // but the Bearer token fallback is now active.
      try {
        const meData = await api.getMe();
        if (!meData.user) {
          // Session was not propagated — but Bearer token should now be active.
          // Try one more /api/me in case the first call raced with session storage.
          const retryMe = await api.getMe();
          if (!retryMe.user) {
            throw new Error('session_not_propagated');
          }
        }
        setUser(meData.user || res.user);
      } catch (verifyErr) {
        if (verifyErr.message === 'session_not_propagated') {
          // If we got here even with Bearer, something is wrong with the token store
          console.warn('[AuthContext] Session not propagated after login');
        }
        // Not fatal — user object from login response is valid, keep it
      }
    }

    return res;
  };

  const register = async (username, password) => {
    const res = await api.register(username, password);
    if (res.user) {
      setUser(res.user);
      setAuthError(null);
      // Verify session after register as well
      try {
        await api.getMe();
      } catch (_) {}
    }
    return res;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (_) {}
    clearSessionToken();
    setUser(null);
    setAuthError(null);
  };

  const updateAvatar = async (file) => {
    const data = await api.uploadUserAvatar(file);
    if (data && data.user) {
      setUser(data.user);
      setAuthError(null);
      return data.user;
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, register, logout, checkAuth, updateAvatar }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
