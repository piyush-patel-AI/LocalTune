import { useState, useEffect, useRef } from 'react';
import { IconRefresh, IconUser, IconMusic, IconCheck, IconChevronRight, IconDisc } from '../components/Icons';
import { useAuth } from '../context/AuthContext';

export default function MobileSettingsView() {
  const { user, uploadAvatar } = useAuth();
  const [quality, setQuality] = useState('High 320kbps');
  const [normalizeVolume, setNormalizeVolume] = useState(true);
  const [crossfade, setCrossfade] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [stats, setStats] = useState({ totalTracks: 0, totalArtists: 0, totalAlbums: 0 });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingAvatar(true);
      await uploadAvatar(file);
    } catch (err) {
      alert(err.message || 'Failed to upload profile picture');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setStats({
          totalTracks: data.totalTracks || 0,
          totalArtists: data.totalArtists || 0,
          totalAlbums: data.totalAlbums || 0
        });
      }
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  const handleRescan = async () => {
    try {
      setScanning(true);
      setScanMessage('Scanning local music library directory...');
      const res = await fetch('/api/scan', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setScanMessage(`Scan complete! ${data.added || 0} new tracks indexed.`);
        fetchStats();
      } else {
        setScanMessage('Scan completed.');
      }
    } catch (err) {
      setScanMessage('Scan error occurred.');
    } finally {
      setTimeout(() => {
        setScanning(false);
        setScanMessage('');
      }, 3000);
    }
  };

  const displayName = user ? (user.displayName || user.username) : 'LocalTune User';
  const usernameTag = user ? `@${user.username}` : '@user';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="mobile-settings animate-fade-in" style={{ padding: '0 0 2rem 0' }}>
      {/* Header Banner */}
      <div className="explore-banner" style={{ margin: '0.75rem 1.25rem 1.5rem 1.25rem' }}>
        <h1 className="explore-title">Preferences</h1>
        <p className="explore-subtitle">Audio playback, library rescan, and system configuration.</p>
      </div>

      {/* User Profile Card */}
      <section className="section-container">
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(14, 18, 26, 0.8))',
            border: '1px solid var(--glass-border-hover)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            position: 'relative'
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarFileSelect}
            accept="image/*"
            style={{ display: 'none' }}
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className="user-avatar"
            style={{
              width: '60px',
              height: '60px',
              fontSize: '1.3rem',
              position: 'relative',
              cursor: 'pointer',
              overflow: 'hidden',
              flexShrink: 0,
              background: 'var(--accent-primary)',
              color: '#000000',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.2)'
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
                background: 'rgba(0, 0, 0, 0.4)',
                opacity: uploadingAvatar ? 1 : 0,
                transition: 'opacity 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '0.7rem'
              }}
              className="avatar-hover-overlay"
            >
              {uploadingAvatar ? '...' : '📷'}
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
              {displayName}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {usernameTag}
              </span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  color: 'var(--accent-primary)',
                  borderRadius: 'var(--radius-pill)',
                  padding: '0.2rem 0.6rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {uploadingAvatar ? 'Uploading...' : 'Upload PFP'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Audio Playback Settings Group */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Audio Playback
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Quality Selector */}
          <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Streaming Audio Quality</h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Adjust audio bandwidth and fidelity</p>
            </div>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--glass-border-hover)',
                color: '#ffffff',
                padding: '0.4rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                outline: 'none'
              }}
            >
              <option value="Lossless Original" style={{ background: '#0e121a' }}>Lossless Original</option>
              <option value="High 320kbps" style={{ background: '#0e121a' }}>High (320 kbps)</option>
              <option value="Standard 160kbps" style={{ background: '#0e121a' }}>Standard (160 kbps)</option>
            </select>
          </div>

          {/* Normalize Volume Toggle */}
          <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Normalize Volume</h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Set same volume level for all songs</p>
            </div>
            <div
              className={`custom-toggle-switch ${normalizeVolume ? 'active' : ''}`}
              onClick={() => setNormalizeVolume(!normalizeVolume)}
            >
              <div className="toggle-thumb" />
            </div>
          </div>

          {/* Crossfade Toggle */}
          <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Crossfade Transitions</h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Smooth gapless playback blending</p>
            </div>
            <div
              className={`custom-toggle-switch ${crossfade ? 'active' : ''}`}
              onClick={() => setCrossfade(!crossfade)}
            >
              <div className="toggle-thumb" />
            </div>
          </div>
        </div>
      </section>

      {/* Library Rescan & Storage */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Library & Storage
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center', marginBottom: '1.25rem' }}>
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
              <IconMusic size={18} color="var(--accent-primary)" />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                {stats.totalTracks}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tracks</span>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
              <IconUser size={18} color="var(--accent-primary)" />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                {stats.totalArtists}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Artists</span>
            </div>
            <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: '0.75rem 0.5rem', borderRadius: 'var(--radius-sm)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
              <IconDisc size={18} color="var(--accent-primary)" />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: '#ffffff' }}>
                {stats.totalAlbums}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Albums</span>
            </div>
          </div>

          <button
            className="btn-secondary"
            onClick={handleRescan}
            disabled={scanning}
            style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
          >
            <IconRefresh size={16} color="#ffffff" className={scanning ? 'animate-spin' : ''} />
            <span>{scanning ? 'Scanning Directory...' : 'Rescan Music Library'}</span>
          </button>

          {scanMessage && (
            <p style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', textAlign: 'center', marginTop: '0.75rem', fontWeight: 600 }}>
              {scanMessage}
            </p>
          )}
        </div>
      </section>

      {/* System Server Info */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Server System
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Backend Server Port</span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>5000</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Mobile Client Port</span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>5174</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>LocalTune Build</span>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>v2.4.0 Mobile Redesign</span>
          </div>
        </div>
      </section>
    </div>
  );
}
