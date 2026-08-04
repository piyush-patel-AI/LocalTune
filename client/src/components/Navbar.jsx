import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  IconHome,
  IconMusic,
  IconDisc,
  IconUser,
  IconPlaylists,
  IconHeart,
  IconSearch,
  IconLogOut
} from './Icons';

export default function Navbar({ activeView, setActiveView }) {
  const { user, logout, uploadAvatar } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const navItems = [
    { id: 'home', label: 'Home', icon: IconHome },
    { id: 'search', label: 'Search', icon: IconSearch },
    { id: 'library', label: 'Library', icon: IconMusic },
    { id: 'albums', label: 'Albums & EPs', icon: IconDisc, secondary: true },
    { id: 'artists', label: 'Artists', icon: IconUser, secondary: true },
    { id: 'playlists', label: 'Playlists', icon: IconPlaylists, secondary: true },
    { id: 'favorites', label: 'Favorites', icon: IconHeart }
  ];

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      await uploadAvatar(file);
    } catch (err) {
      alert(err.message || 'Failed to upload profile picture');
    } finally {
      setUploading(false);
    }
  };

  const initial = user ? (user.displayName ? user.displayName[0].toUpperCase() : user.username[0].toUpperCase()) : 'U';

  return (
    <nav className="sidebar">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarFileSelect}
        accept="image/*"
        style={{ display: 'none' }}
      />

      <div className="sidebar-top-container">
        <div className="brand-header">
          <img
            src="/api/logo"
            alt="LocalTune Logo"
            style={{ width: '34px', height: '34px', objectFit: 'contain', borderRadius: 'var(--radius-md)' }}
          />
          <div>
            <div className="brand-title">LocalTune</div>
            <div className="brand-subtitle">Your Library</div>
          </div>
        </div>

        <ul className="nav-list">
          {navItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = activeView === item.id;
            const isFirstSecondary = item.id === 'albums';

            return (
              <div key={item.id} style={{ display: 'contents' }}>
                {isFirstSecondary && <div className="nav-divider" />}
                <li className={`nav-item ${item.secondary ? 'secondary-nav-item' : ''} ${isActive ? 'active' : ''}`}>
                  <button onClick={() => setActiveView(item.id)}>
                    <div className="nav-icon-box">
                      <IconComponent
                        size={19}
                        color={isActive ? 'var(--accent-primary)' : 'var(--text-secondary)'}
                        fill={item.id === 'favorites' && isActive ? 'var(--accent-crimson)' : 'none'}
                      />
                    </div>
                    <span className="nav-label">{item.label}</span>
                  </button>
                </li>
              </div>
            );
          })}
        </ul>
      </div>

      <div className="sidebar-bottom">
        {user && (
          <div className="user-profile">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.68rem', flex: 1, minWidth: 0 }}>
              <div
                className="user-avatar"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: 'hidden',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--accent-primary)',
                  color: '#000000',
                  fontWeight: 800
                }}
                title="Click to upload profile picture"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName || user.username}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  initial
                )}
              </div>
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                title="Click to upload profile picture"
              >
                <div style={{ fontSize: '0.85rem', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#ffffff' }}>
                  {user.displayName || user.username}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', opacity: 0.9 }}>
                  {uploading ? 'Uploading PFP...' : 'Change Photo'}
                </div>
              </div>
            </div>
            <button className="logout-btn" onClick={logout} title="Logout">
              <IconLogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
