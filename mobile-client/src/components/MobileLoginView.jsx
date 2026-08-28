import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUrl } from '../config';

export default function MobileLoginView() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicUsers, setPublicUsers] = useState([]);

  useEffect(() => {
    fetch(apiUrl('/api/users/public'))
      .then((res) => res.json())
      .then((data) => {
        if (data.users) {
          setPublicUsers(data.users);
          if (data.users.length > 0 && !username) {
            setUsername(data.users[0].username);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch public users:', err));
  }, []);

  const selectedUser = publicUsers.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase()
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg('');
    setLoading(true);

    try {
      if (isRegister) {
        await register(username, password, displayName);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setErrMsg(err.message || (isRegister ? 'Registration failed' : 'Invalid username or password'));
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = (registerMode) => {
    setIsRegister(registerMode);
    setErrMsg('');
  };

  const activeAvatarUrl = selectedUser?.avatarUrl;

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        background: 'linear-gradient(145deg, #07090e 0%, #0f131d 50%, #151b29 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        color: '#ffffff'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--glass-border-hover)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem 1.25rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
        }}
      >
        {/* Brand Header & Selected User Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '1.25rem' }}>
          {activeAvatarUrl ? (
            <img
              src={activeAvatarUrl}
              alt={selectedUser.displayName || selectedUser.username}
              style={{
                width: '72px',
                height: '72px',
                objectFit: 'cover',
                borderRadius: '50%',
                marginBottom: '0.75rem',
                border: '3px solid var(--accent-primary)',
                boxShadow: '0 4px 20px rgba(245,158,11,0.4)'
              }}
            />
          ) : (
            <img
              src="/logo.png"
              alt="Octave Logo"
              style={{ width: '56px', height: '56px', objectFit: 'contain', borderRadius: '14px', marginBottom: '0.75rem', filter: 'drop-shadow(0 4px 12px rgba(245,158,11,0.3))' }}
            />
          )}
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {selectedUser && !isRegister ? selectedUser.displayName : 'Octave'}
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
            {isRegister ? 'Create your LAN music profile' : 'Sign in to access your music'}
          </p>
        </div>

        {/* Account Selection Pills */}
        {!isRegister && publicUsers.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', textAlign: 'center' }}>
              Select Account
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              {publicUsers.map((u) => {
                const isSelected = u.username.toLowerCase() === username.trim().toLowerCase();
                const init = (u.displayName || u.username).charAt(0).toUpperCase();
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setUsername(u.username)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '0.3rem 0.65rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      color: isSelected ? 'var(--accent-primary)' : '#ffffff'
                    }}
                  >
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', overflow: 'hidden', background: 'var(--accent-primary)', color: '#000', fontWeight: 800, fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        init
                      )}
                    </div>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{u.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Auth Mode Toggle Pills */}
        <div
          style={{
            display: 'flex',
            background: 'rgba(0, 0, 0, 0.3)',
            padding: '4px',
            borderRadius: 'var(--radius-pill)',
            marginBottom: '1.25rem',
            border: '1px solid var(--glass-border)'
          }}
        >
          <button
            type="button"
            onClick={() => toggleMode(false)}
            style={{
              flex: 1,
              padding: '0.45rem',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: !isRegister ? 'var(--accent-primary)' : 'transparent',
              color: !isRegister ? '#000000' : 'var(--text-secondary)',
              transition: 'all 0.2s ease'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => toggleMode(true)}
            style={{
              flex: 1,
              padding: '0.45rem',
              borderRadius: 'var(--radius-pill)',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: isRegister ? 'var(--accent-primary)' : 'transparent',
              color: isRegister ? '#000000' : 'var(--text-secondary)',
              transition: 'all 0.2s ease'
            }}
          >
            Create Account
          </button>
        </div>

        {/* Error Alert */}
        {errMsg && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              marginBottom: '1.25rem',
              textAlign: 'center'
            }}
          >
            {errMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              required
              autoFocus
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--glass-border-hover)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 0.9rem',
                color: '#ffffff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {isRegister && (
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Display Name <span style={{ opacity: 0.6, fontWeight: 400 }}>(Optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Piyush"
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid var(--glass-border-hover)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 0.9rem',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none'
                }}
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid var(--glass-border-hover)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 0.9rem',
                color: '#ffffff',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: '100%',
              padding: '0.8rem',
              fontSize: '0.9rem',
              fontWeight: 800,
              marginTop: '0.5rem',
              borderRadius: 'var(--radius-pill)',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? (isRegister ? 'Creating Account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
}
