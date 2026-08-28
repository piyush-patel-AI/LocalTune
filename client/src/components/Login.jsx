import { useState, useEffect } from 'react';
import logo from '../../../Assets/logo.png';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [publicUsers, setPublicUsers] = useState([]);

  useEffect(() => {
    fetch('/api/users/public')
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
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '420px', width: '100%' }}>
        <div className="brand-header" style={{ justifyContent: 'center', borderWidth: 0, paddingBottom: '0.75rem', flexDirection: 'column', alignItems: 'center' }}>
          {activeAvatarUrl ? (
            <img
              src={activeAvatarUrl}
              alt={selectedUser.displayName || selectedUser.username}
              style={{
                width: '72px',
                height: '72px',
                objectFit: 'cover',
                borderRadius: '50%',
                marginBottom: '0.5rem',
                border: '3px solid var(--accent-primary)',
                boxShadow: '0 8px 20px rgba(245, 158, 11, 0.3)'
              }}
            />
          ) : (
            <img
              src={logo}
              alt="Octave Logo"
              style={{ width: '56px', height: '56px', objectFit: 'contain', borderRadius: 'var(--radius-md)', marginBottom: '0.5rem' }}
            />
          )}

          <div className="brand-title" style={{ fontSize: '1.75rem' }}>
            {selectedUser && !isRegister ? selectedUser.displayName : 'Octave'}
          </div>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', textAlign: 'center', marginBottom: '1.25rem' }}>
          {isRegister ? 'Create your personal music account' : 'Personal LAN Music Streaming'}
        </p>

        {/* Account Quick Select Pills */}
        {!isRegister && publicUsers.length > 0 && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem', textAlign: 'center' }}>
              Select Account
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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
                      gap: '0.5rem',
                      background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                      border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                      borderRadius: 'var(--radius-pill)',
                      padding: '0.35rem 0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      color: isSelected ? 'var(--accent-primary)' : '#ffffff'
                    }}
                  >
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', background: 'var(--accent-primary)', color: '#000', fontWeight: 800, fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt={u.username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        init
                      )}
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700 }}>{u.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.05)', padding: '4px', borderRadius: 'var(--radius-pill)', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
          <button
            type="button"
            className={`btn-secondary ${!isRegister ? 'active' : ''}`}
            onClick={() => toggleMode(false)}
            style={{
              flex: 1,
              justifyContent: 'center',
              borderRadius: 'var(--radius-pill)',
              fontSize: '0.85rem',
              fontWeight: 700,
              padding: '0.45rem',
              background: !isRegister ? 'var(--accent-primary)' : 'transparent',
              color: !isRegister ? '#0f172a' : 'var(--text-secondary)',
              border: 'none'
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`btn-secondary ${isRegister ? 'active' : ''}`}
            onClick={() => toggleMode(true)}
            style={{
              flex: 1,
              justifyContent: 'center',
              borderRadius: 'var(--radius-pill)',
              fontSize: '0.85rem',
              fontWeight: 700,
              padding: '0.45rem',
              background: isRegister ? 'var(--accent-primary)' : 'transparent',
              color: isRegister ? '#0f172a' : 'var(--text-secondary)',
              border: 'none'
            }}
          >
            Create Account
          </button>
        </div>

        {errMsg && (
          <div className="error-alert" style={{ marginBottom: '1.25rem' }}>
            {errMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. piyush"
              required
              autoFocus
            />
          </div>

          {isRegister && (
            <div className="form-group">
              <label className="form-label">Display Name <span style={{ opacity: 0.6, fontWeight: 400 }}>(Optional)</span></label>
              <input
                type="text"
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Piyush Patel"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', padding: '0.65rem' }}
            disabled={loading}
          >
            {loading ? (isRegister ? 'Creating Account...' : 'Signing in...') : (isRegister ? 'Create Account' : 'Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
}
