import React, { useState, useEffect } from 'react';
import { apiUrl } from '../services/api.js';

/**
 * Renders the current user's profile image, if present, with a graceful
 * fallback to the user's initial. Centralizes (a) the avatarUrl -> absolute
 * URL mapping and (b) broken-image handling so Header and Account surfaces
 * share one consistent source of truth.
 */
export function UserAvatar({ user, size = 32, className = '', ringClass = '' }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = user?.avatarUrl ? apiUrl(user.avatarUrl) : null;

  // Reset the broken-image flag whenever the source changes (e.g. after a
  // successful upload that replaces a previously-broken image).
  useEffect(() => {
    setFailed(false);
  }, [avatarUrl]);

  if (!user) return null;

  const displayName = user.displayName || user.username || 'User';
  const initial = displayName.charAt(0).toUpperCase();

  const renderInitial = () => (
    <span style={{ fontSize: Math.max(11, Math.round(size * 0.4)) }} className="font-bold text-white leading-none select-none">
      {initial}
    </span>
  );

  return (
    <div
      className={`rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center ${ringClass} ${className}`}
      style={{ width: size, height: size }}
      data-purpose="user-avatar"
    >
      {avatarUrl && !failed ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        renderInitial()
      )}
    </div>
  );
}
