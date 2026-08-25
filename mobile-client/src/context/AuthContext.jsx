import { createContext, useContext, useState, useEffect } from 'react';
import { apiUrl } from '../config';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuthStatus = async () => {
    try {
      const res = await fetch(apiUrl('/api/me'), { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const login = async (username, password) => {
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const register = async (username, password, displayName) => {
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, displayName })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await fetch(apiUrl('/api/logout'), { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  const uploadAvatar = async (file) => {
    setError(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch(apiUrl('/api/users/avatar'), {
        method: 'POST',
        credentials: 'include',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload avatar');
      }

      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, register, logout, uploadAvatar, refreshAuth: checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
