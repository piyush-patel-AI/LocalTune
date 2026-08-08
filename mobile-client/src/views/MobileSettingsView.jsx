import { useState, useEffect, useRef } from 'react';
import {
  IconRefresh,
  IconUser,
  IconMusic,
  IconCheck,
  IconDisc,
  IconSparkles,
  IconFlame,
  IconHeart,
  IconPlay
} from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

const QUALITY_OPTIONS = [
  { label: 'Normal (128 kbps)', value: 'Normal' },
  { label: 'High (256 kbps)', value: 'High' },
  { label: 'Very High (Lossless / 320 kbps)', value: 'Very High' }
];

const REC_MODES = [
  { name: 'Default', desc: 'Balanced personalized recommendations' },
  { name: 'Discover', desc: 'Surfaces obscure & new artists' },
  { name: 'Relax', desc: 'Calm ambient, acoustic, and chill vibes' },
  { name: 'Workout', desc: 'High tempo, intense cardio rhythms' },
  { name: 'Focus', desc: 'Instrumental and deep concentration tracks' },
  { name: 'Throwback', desc: 'Nostalgic library favorites' }
];

export default function MobileSettingsView() {
  const { user, uploadAvatar, logout } = useAuth();
  const {
    ambientBgEnabled,
    setAmbientBgEnabled,
    crossfade,
    setCrossfade,
    normalizeVolume,
    setNormalizeVolume,
    autoplay,
    setAutoplay,
    recommendationMode,
    setRecommendationMode,
    discoveryMode,
    setDiscoveryMode,
    audioQuality,
    setAudioQuality
  } = usePlayer();

  const [scanning, setScanning] = useState(false);
  const [scanningMeta, setScanningMeta] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [stats, setStats] = useState({ totalTracks: 0, totalArtists: 0, totalAlbums: 0 });
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
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

  const handleAvatarFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingAvatar(true);
      await uploadAvatar(file);
      showToast('Profile picture updated successfully!');
    } catch (err) {
      alert(err.message || 'Failed to upload profile picture');
    } finally {
      setUploadingAvatar(false);
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
      }, 3500);
    }
  };

  const handleRescanMetadata = async () => {
    try {
      setScanningMeta(true);
      setScanMessage('Refreshing track metadata & artwork...');
      const res = await fetch('/api/tracks/scan-missing-metadata', {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setScanMessage(`Metadata scan complete! Updated ${data.updatedCount || 0} tracks.`);
        fetchStats();
      } else {
        setScanMessage('Metadata refresh done.');
      }
    } catch (err) {
      setScanMessage('Metadata scan error.');
    } finally {
      setTimeout(() => {
        setScanningMeta(false);
        setScanMessage('');
      }, 3500);
    }
  };

  const handleResetRecCache = () => {
    localStorage.removeItem('localTune_recentlyPlayed');
    localStorage.removeItem('localTune_listeningHistory');
    showToast('Recommendation listening history reset!');
  };

  const displayName = user ? (user.displayName || user.username) : 'LocalTune User';
  const usernameTag = user ? `@${user.username}` : '@user';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="mobile-settings animate-fade-in" style={{ padding: '0 0 3rem 0' }}>
      {/* Header Banner */}
      <div className="explore-banner" style={{ margin: '0.75rem 1.25rem 1.5rem 1.25rem' }}>
        <h1 className="explore-title">Settings</h1>
        <p className="explore-subtitle">Customize audio playback, recommendation tuning, and system preferences.</p>
      </div>

      {toastMessage && (
        <div style={{
          margin: '0 1.25rem 1rem 1.25rem',
          padding: '0.75rem 1rem',
          background: 'rgba(245, 158, 11, 0.2)',
          border: '1px solid var(--accent-primary)',
          borderRadius: 'var(--radius-md)',
          color: '#ffffff',
          fontSize: '0.85rem',
          fontWeight: 700,
          textAlign: 'center'
        }}>
          {toastMessage}
        </div>
      )}

      {/* User Account Profile Card */}
      <section className="section-container">
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(15, 23, 42, 0.9))',
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
              width: '64px',
              height: '64px',
              fontSize: '1.4rem',
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
              border: '2px solid rgba(255, 255, 255, 0.3)'
            }}
            title="Click to change profile picture"
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
                background: 'rgba(0, 0, 0, 0.5)',
                opacity: uploadingAvatar ? 1 : 0,
                transition: 'opacity 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700
              }}
            >
              {uploadingAvatar ? '...' : '📷'}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName}
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              {usernameTag}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid var(--glass-border-hover)',
                  color: '#ffffff',
                  borderRadius: 'var(--radius-pill)',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {uploadingAvatar ? 'Uploading...' : 'Change Avatar'}
              </button>
              {logout && (
                <button
                  type="button"
                  onClick={logout}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    borderRadius: 'var(--radius-pill)',
                    padding: '0.25rem 0.75rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Log Out
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Audio Playback Settings Group (Spotify Style) */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Audio Playback
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          {/* Quality Selector */}
          <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Audio Streaming Quality</h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Sets streaming bitrate and audio fidelity</p>
            </div>
            <select
              value={audioQuality}
              onChange={(e) => {
                setAudioQuality(e.target.value);
                showToast(`Audio quality set to ${e.target.value}`);
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--glass-border-hover)',
                color: '#ffffff',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                outline: 'none',
                fontWeight: 600
              }}
            >
              {QUALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ background: '#0e121a' }}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Autoplay Similar Songs */}
          <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Autoplay Recommendations</h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Keep playing similar tracks when your queue ends</p>
            </div>
            <div
              className={`custom-toggle-switch ${autoplay ? 'active' : ''}`}
              onClick={() => {
                setAutoplay(!autoplay);
                showToast(`Autoplay ${!autoplay ? 'enabled' : 'disabled'}`);
              }}
            >
              <div className="toggle-thumb" />
            </div>
          </div>

          {/* Normalize Volume Toggle */}
          <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
            <div>
              <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Normalize Volume</h3>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Maintains consistent loudness across tracks</p>
            </div>
            <div
              className={`custom-toggle-switch ${normalizeVolume ? 'active' : ''}`}
              onClick={() => {
                setNormalizeVolume(!normalizeVolume);
                showToast(`Volume normalization ${!normalizeVolume ? 'enabled' : 'disabled'}`);
              }}
            >
              <div className="toggle-thumb" />
            </div>
          </div>

          {/* Crossfade Transition Slider */}
          <div style={{ padding: '1rem 1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <div>
                <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Crossfade Transitions</h3>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Smooth gapless song blending</p>
              </div>
              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                {crossfade > 0 ? `${crossfade}s` : 'Off'}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="12"
              step="1"
              value={crossfade}
              onChange={(e) => setCrossfade(parseInt(e.target.value, 10))}
              style={{
                width: '100%',
                accentColor: 'var(--accent-primary)',
                cursor: 'pointer'
              }}
            />
          </div>
        </div>
      </section>

      {/* Recommendation Engine Preset Control */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Recommendation Tuning
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.3rem' }}>
            Listening Mode Preset
          </h3>
          <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Select how the recommendation algorithm shapes your music queue.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem', marginBottom: '1.25rem' }}>
            {REC_MODES.map((mode) => {
              const selected = recommendationMode === mode.name;
              return (
                <div
                  key={mode.name}
                  onClick={() => {
                    setRecommendationMode(mode.name);
                    showToast(`Recommendation preset set to ${mode.name}`);
                  }}
                  style={{
                    background: selected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                    border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', color: selected ? 'var(--accent-primary)' : '#ffffff' }}>
                      {mode.name}
                    </span>
                    {selected && <IconCheck size={14} color="var(--accent-primary)" />}
                  </div>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {mode.desc}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Discovery Boost Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)' }}>
            <div>
              <h3 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>Discovery Boost</h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Surface unfamiliar genres and new library tracks</p>
            </div>
            <div
              className={`custom-toggle-switch ${discoveryMode ? 'active' : ''}`}
              onClick={() => {
                setDiscoveryMode(!discoveryMode);
                showToast(`Discovery boost ${!discoveryMode ? 'enabled' : 'disabled'}`);
              }}
            >
              <div className="toggle-thumb" />
            </div>
          </div>
        </div>
      </section>

      {/* Dynamic Ambient Background Appearance */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Appearance
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>Dynamic Ambient Lighting</h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Extract color palette from current album art for fluid background glow</p>
          </div>
          <div
            className={`custom-toggle-switch ${ambientBgEnabled ? 'active' : ''}`}
            onClick={() => {
              setAmbientBgEnabled(!ambientBgEnabled);
              showToast(`Ambient background ${!ambientBgEnabled ? 'enabled' : 'disabled'}`);
            }}
          >
            <div className="toggle-thumb" />
          </div>
        </div>
      </section>

      {/* Library Rescan & Storage */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Library & Management
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <button
              className="btn-secondary"
              onClick={handleRescan}
              disabled={scanning}
              style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.88rem' }}
            >
              <IconRefresh size={16} color="#ffffff" className={scanning ? 'animate-spin' : ''} />
              <span>{scanning ? 'Scanning Directory...' : 'Rescan Music Library'}</span>
            </button>

            <button
              className="btn-secondary"
              onClick={handleRescanMetadata}
              disabled={scanningMeta}
              style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.88rem', background: 'rgba(255, 255, 255, 0.05)' }}
            >
              <IconSparkles size={16} color="var(--accent-primary)" className={scanningMeta ? 'animate-spin' : ''} />
              <span>{scanningMeta ? 'Refreshing Tags...' : 'Refresh Track Metadata & Artwork'}</span>
            </button>

            <button
              className="btn-secondary"
              onClick={handleResetRecCache}
              style={{ width: '100%', padding: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'transparent', border: '1px dashed var(--glass-border)' }}
            >
              <span>Reset Local Listening Cache</span>
            </button>
          </div>

          {scanMessage && (
            <p style={{ fontSize: '0.78rem', color: 'var(--accent-primary)', textAlign: 'center', marginTop: '0.75rem', fontWeight: 600 }}>
              {scanMessage}
            </p>
          )}
        </div>
      </section>

      {/* System Server Info */}
      <section className="section-container">
        <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.65rem', display: 'block' }}>
          Server System Info
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
            <span>LocalTune Engine</span>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>v2.4.0 Spotify Experience</span>
          </div>
        </div>
      </section>
    </div>
  );
}
