import { useState, useRef } from 'react';
import BottomSheet from './BottomSheet';
import { useAuth } from '../context/AuthContext';
import {
  IconUser,
  IconMusic,
  IconSparkles,
  IconShield,
  IconCamera,
  IconLogOut
} from './Icons';

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
      <div className="profile-header-group">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          style={{ display: 'none' }}
        />

        {/* Avatar with glowing ring and camera hover overlay */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className="profile-avatar-container"
          title="Click to upload profile picture"
        >
          <div className="profile-large-avatar">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={displayName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initial
            )}

            <div className="profile-avatar-overlay">
              <IconCamera size={22} color="#ffffff" />
            </div>
          </div>
        </div>

        {/* Change Picture Action Pill */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="change-avatar-btn"
        >
          <IconCamera size={14} color="var(--accent-primary)" />
          <span>{uploading ? 'Uploading Picture...' : 'Change Profile Picture'}</span>
        </button>

        <h2 className="profile-name">{displayName}</h2>
        <span className="profile-badge">@{user ? user.username : 'user'}</span>
      </div>

      {/* Info Card List */}
      <div className="profile-info-card">
        <div className="profile-info-row">
          <div className="info-label-group">
            <IconUser size={16} color="var(--accent-primary)" />
            <span className="info-label">Username</span>
          </div>
          <span className="info-val">@{user?.username || 'Guest'}</span>
        </div>

        <div className="profile-info-row">
          <div className="info-label-group">
            <IconSparkles size={16} color="var(--accent-primary)" />
            <span className="info-label">Display Name</span>
          </div>
          <span className="info-val">{displayName}</span>
        </div>

        <div className="profile-info-row">
          <div className="info-label-group">
            <IconMusic size={16} color="var(--accent-primary)" />
            <span className="info-label">Audio Quality</span>
          </div>
          <span className="info-pill-badge">Hi-Fi 320kbps</span>
        </div>

        <div className="profile-info-row" style={{ borderBottom: 'none' }}>
          <div className="info-label-group">
            <IconShield size={16} color="var(--accent-primary)" />
            <span className="info-label">Playback Engine</span>
          </div>
          <span className="info-val" style={{ fontSize: '0.78rem' }}>HTML5 & MediaSession</span>
        </div>
      </div>

      {/* Footer Actions */}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
        <button
          className="profile-signout-btn"
          onClick={handleLogout}
        >
          <IconLogOut size={16} color="#ef4444" />
          Sign Out
        </button>
        <button
          className="profile-done-btn"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </BottomSheet>
  );
}
