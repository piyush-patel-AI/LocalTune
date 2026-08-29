import { useState, useEffect, useRef } from 'react';
import logo from '../../../Assets/logo.png';
import { useAuth } from '../context/AuthContext';
import { IconChevronRight } from './Icons';

function AccountAvatar({ acc }) {
  const [failed, setFailed] = useState(false);
  if (!acc.avatarUrl || failed) {
    return (acc.displayName || acc.username).charAt(0).toUpperCase();
  }
  return <img src={acc.avatarUrl} alt={acc.displayName} onError={() => setFailed(true)} />;
}

export default function MobileLoginView() {
  const { login, register, rememberedAccounts } = useAuth();
  const remembered = rememberedAccounts;

  const [view, setView] = useState(() => (remembered.length > 0 ? 'picker' : 'signin'));
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const usernameRef = useRef(null);
  const passwordRef = useRef(null);
  const [focusTarget, setFocusTarget] = useState(remembered.length > 0 ? null : 'username');

  useEffect(() => {
    if (!focusTarget) return;
    const el = focusTarget === 'username' ? usernameRef.current : passwordRef.current;
    if (el) el.focus();
    setFocusTarget(null);
  }, [focusTarget, view]);

  const selectAccount = (acc) => {
    setUsername(acc.username);
    setPassword('');
    setErrMsg('');
    setView('signin');
    setFocusTarget('password');
  };

  const useAnother = () => {
    setUsername('');
    setPassword('');
    setErrMsg('');
    setView('signin');
    setFocusTarget('username');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrMsg('');
    setLoading(true);

    try {
      if (view === 'register') {
        await register(username, password, displayName);
      } else {
        await login(username, password);
      }
    } catch (err) {
      setErrMsg(err.message || (view === 'register' ? 'Registration failed' : 'Invalid username or password'));
    } finally {
      setLoading(false);
    }
  };

  const isRegister = view === 'register';

  const inputStyle = {
    width: '100%',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid var(--glass-border-hover)',
    borderRadius: 'var(--radius-md)',
    padding: '0.8rem 0.9rem',
    color: '#ffffff',
    fontSize: '0.95rem',
    outline: 'none',
    boxSizing: 'border-box'
  };

  const labelStyle = {
    display: 'block',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    marginBottom: '0.4rem'
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: 'linear-gradient(155deg, #06080d 0%, #0c1018 55%, #121826 100%)',
        color: '#ffffff'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          margin: 'auto',
          background: 'rgba(255, 255, 255, 0.035)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          padding: '2rem 1.5rem',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
          boxSizing: 'border-box'
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            marginBottom: view === 'picker' ? '1.5rem' : '1.75rem'
          }}
        >
          <img
            src={logo}
            alt="Octave"
            style={{
              width: '54px',
              height: '54px',
              objectFit: 'contain',
              borderRadius: '14px',
              marginBottom: '14px'
            }}
          />
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.55rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              margin: 0,
              color: '#ffffff'
            }}
          >
            {view === 'picker' ? 'Welcome back' : isRegister ? 'Create your account' : 'Sign in'}
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0.35rem 0 0' }}>
            {view === 'picker'
              ? 'Choose an account to continue'
              : isRegister
              ? 'Join Octave to listen on your network'
              : 'Sign in to continue listening'}
          </p>
        </div>

        {/* Remembered account switcher */}
        {view === 'picker' && (
          <section>
            <div className="auth-section-label">
              {remembered.length > 1 ? 'Your accounts' : 'Your account'}
            </div>
            <div className="account-list">
              {remembered.map((acc) => (
                <button
                  type="button"
                  key={acc.username}
                  className="account-row"
                  onClick={() => selectAccount(acc)}
                >
                  <span className="account-row-avatar">
                    <AccountAvatar acc={acc} />
                  </span>
                    <span className="account-row-meta">
                      <span className="account-row-name">{acc.displayName || acc.username}</span>
                      <span className="account-row-handle">@{acc.username}</span>
                    </span>
                    <IconChevronRight size={18} className="account-row-chevron" />
                  </button>
              ))}
            </div>
            <button type="button" className="ghost-btn" onClick={useAnother}>
              Use another account
            </button>
          </section>
        )}

        {/* Credential form */}
        {view !== 'picker' && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Mode toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(0, 0, 0, 0.3)',
                padding: '4px',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--glass-border)'
              }}
            >
              <button
                type="button"
                onClick={() => setView('signin')}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: !isRegister ? 'var(--accent-primary)' : 'transparent',
                  color: !isRegister ? '#000000' : 'var(--text-secondary)'
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setView('register')}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  border: 'none',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: isRegister ? 'var(--accent-primary)' : 'transparent',
                  color: isRegister ? '#000000' : 'var(--text-secondary)'
                }}
              >
                Create Account
              </button>
            </div>

            {errMsg && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#fca5a5',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.82rem',
                  textAlign: 'center'
                }}
              >
                {errMsg}
              </div>
            )}

            <div>
              <label style={labelStyle}>Username</label>
              <input
                ref={usernameRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                style={inputStyle}
              />
            </div>

            {isRegister && (
              <div>
                <label style={labelStyle}>
                  Display Name <span style={{ opacity: 0.6, fontWeight: 400 }}>(Optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Piyush"
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={labelStyle}>Password</label>
              <input
                ref={passwordRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={inputStyle}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary"
              style={{
                width: '100%',
                padding: '0.8rem',
                fontSize: '0.92rem',
                fontWeight: 800,
                marginTop: '0.25rem'
              }}
            >
              {loading ? (isRegister ? 'Creating...' : 'Signing in...') : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
