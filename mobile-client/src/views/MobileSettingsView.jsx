import { useState, useRef } from 'react';
import { IconCheck } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';

const ACCENT_PRESETS = [
  { label: 'Blue', color: '#4ea8de' },
  { label: 'Purple', color: '#a855f7' },
  { label: 'Rose', color: '#f43f5e' },
  { label: 'Emerald', color: '#10b981' },
  { label: 'Amber', color: '#f59e0b' },
  { label: 'Cyan', color: '#06b6d4' }
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
    accentMode,
    setAccentMode,
    customAccentColor,
    setCustomAccentColor
  } = usePlayer();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const fileInputRef = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3000);
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

  const displayName = user ? (user.displayName || user.username) : 'Octave User';
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
          background: 'rgba(78, 168, 222, 0.2)',
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
            background: 'linear-gradient(135deg, rgba(78, 168, 222, 0.15), rgba(15, 23, 42, 0.9))',
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
        <span className="settings-section-label">
          Audio Playback
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
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
        <span className="settings-section-label">
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
                    background: selected ? 'rgba(78, 168, 222, 0.15)' : 'rgba(255, 255, 255, 0.04)',
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
        <span className="settings-section-label">
          Appearance
        </span>

        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)' }}>
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

          {/* Accent Color Mode */}
          <div style={{ padding: '1rem 1.25rem' }}>
            <h3 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.3rem' }}>Accent Color</h3>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>Controls the accent used for active icons, buttons, and highlights</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {/* Dynamic */}
              <div
                onClick={() => {
                  setAccentMode('dynamic');
                  showToast('Accent set to Dynamic');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.7rem 0.85rem',
                  background: accentMode === 'dynamic' ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.03)',
                  border: accentMode === 'dynamic' ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'conic-gradient(from 0deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #a855f7, #f43f5e)',
                  flexShrink: 0
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: accentMode === 'dynamic' ? 'var(--accent-primary)' : '#ffffff' }}>Dynamic</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>Uses artwork colors</span>
                </div>
                {accentMode === 'dynamic' && <IconCheck size={14} color="var(--accent-primary)" />}
              </div>

              {/* Default Blue */}
              <div
                onClick={() => {
                  setAccentMode('blue');
                  showToast('Accent set to Default Blue');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.7rem 0.85rem',
                  background: accentMode === 'blue' ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.03)',
                  border: accentMode === 'blue' ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4ea8de', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: accentMode === 'blue' ? 'var(--accent-primary)' : '#ffffff' }}>Default Blue</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>#4ea8de</span>
                </div>
                {accentMode === 'blue' && <IconCheck size={14} color="var(--accent-primary)" />}
              </div>

              {/* Custom */}
              <div
                onClick={() => setAccentMode('custom')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.7rem 0.85rem',
                  background: accentMode === 'custom' ? 'rgba(255, 255, 255, 0.07)' : 'rgba(255, 255, 255, 0.03)',
                  border: accentMode === 'custom' ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: customAccentColor, border: '2px solid rgba(255,255,255,0.15)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: accentMode === 'custom' ? 'var(--accent-primary)' : '#ffffff' }}>Custom</span>
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1px' }}>Choose your own color</span>
                </div>
                {accentMode === 'custom' && <IconCheck size={14} color="var(--accent-primary)" />}
              </div>
            </div>

            {/* Custom Color Picker */}
            {accentMode === 'custom' && (
              <div style={{ marginTop: '0.85rem', padding: '0.85rem', background: 'rgba(255, 255, 255, 0.04)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <label htmlFor="accent-color-input" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Pick a color</label>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{customAccentColor}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  {ACCENT_PRESETS.map((preset) => (
                    <div
                      key={preset.color}
                      onClick={() => {
                        setCustomAccentColor(preset.color);
                        showToast(`Custom accent set to ${preset.label}`);
                      }}
                      title={preset.label}
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: preset.color,
                        border: customAccentColor === preset.color ? '2px solid #ffffff' : '2px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s ease',
                        flexShrink: 0
                      }}
                    />
                  ))}
                  <label
                    htmlFor="accent-color-input"
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.08)',
                      border: '2px dashed rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-muted)',
                      flexShrink: 0
                    }}
                    title="Pick custom color"
                  >
                    +
                  </label>
                  <input
                    id="accent-color-input"
                    type="color"
                    value={customAccentColor}
                    onChange={(e) => setCustomAccentColor(e.target.value)}
                    style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

    </div>
  );
}
