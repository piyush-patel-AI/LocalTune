import { useState, useRef } from 'react';
import BottomSheet from './BottomSheet';
import { useAuth } from '../context/AuthContext';

export default function UserProfileModal({ onClose }) {
  const { user, logout, uploadAvatar } = useAuth();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleLogout = async () => {
    onClose();
    await logout();
  };

  const handleFileChange = async (e) => {
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

  const displayName = user ? (user.displayName || user.username) : 'LocalTune User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <BottomSheet onClose={onClose}>
      <div className="profile-header-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }}
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          className="profile-large-avatar"
          style={{
            position: 'relative',
            cursor: 'pointer',
            overflow: 'hidden',
            background: 'var(--accent-primary)',
            color: '#000000',
            fontWeight: 800,
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
            border: '3px solid rgba(255, 255, 255, 0.2)',
            marginBottom: '0.75rem'
          }}
          title="Click to upload profile picture"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={displayName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            initial
          )}

          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              opacity: uploading ? 1 : 0,
              transition: 'opacity 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '0.8rem'
            }}
          >
            {uploading ? '...' : '📷'}
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            color: 'var(--accent-primary)',
            borderRadius: 'var(--radius-pill)',
            padding: '0.25rem 0.75rem',
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            marginBottom: '0.75rem'
          }}
        >
          {uploading ? 'Uploading Picture...' : '📷 Change Profile Picture'}
        </button>

        <h2 className="profile-name">{displayName}</h2>
        <span className="profile-badge">@{user ? user.username : 'user'}</span>
      </div>

      <div className="profile-info-list" style={{ marginTop: '1rem' }}>
        <div className="profile-info-row">
          <span className="info-label">Username</span>
          <span className="info-val">{user?.username || 'Guest'}</span>
        </div>

        <div className="profile-info-row">
          <span className="info-label">Display Name</span>
          <span className="info-val">{displayName}</span>
        </div>

        <div className="profile-info-row">
          <span className="info-label">Audio Quality</span>
          <span className="info-val">High Quality (320kbps MP3/FLAC)</span>
        </div>

        <div className="profile-info-row">
          <span className="info-label">Playback Engine</span>
          <span className="info-val">HTML5 WebAudio & MediaSession</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button
          className="rescan-action-btn"
          onClick={handleLogout}
          style={{
            flex: 1,
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5'
          }}
        >
          Sign Out
        </button>
        <button
          className="rescan-action-btn"
          onClick={onClose}
          style={{ flex: 1 }}
        >
          Done
        </button>
      </div>
    </BottomSheet>
  );
}
