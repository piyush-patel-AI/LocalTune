import React, { useRef, useState } from 'react';
import { X, LogOut, CheckCircle2, Camera, ImagePlus, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { UserAvatar } from './UserAvatar.jsx';
import { isValidImage, prepareImage, getImageAccept } from '../services/api.js';

export function AccountModal({ isOpen, onClose }) {
  const { user, logout, updateAvatar } = useAuth();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  if (!isOpen || !user) return null;

  const displayName = user.displayName || user.username || 'User';

  const triggerPick = () => {
    setUploadError(null);
    fileInputRef.current?.click();
  };

  const handleSelect = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) {
      // Cancellation
      return;
    }
    setUploadError(null);

    if (!isValidImage(file)) {
      setUploadError('Please choose a valid image (JPG, PNG, WEBP, or GIF) under 10MB.');
      return;
    }

    // Preview (persists in component state only as a live preview; real
    // persistence is via upload to the server below).
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    setUploading(true);
    try {
      const prepared = await prepareImage(file);
      await updateAvatar(prepared);
      // On success, drop the local preview and rely on the persisted avatarUrl
      setPreviewUrl(null);
      setUploadError(null);
    } catch (err) {
      console.error('Profile photo upload failed:', err);
      setUploadError(err.status === 401 ? 'Session expired. Please sign in again.' : 'Upload failed. Please try again.');
      setPreviewUrl(null);
    } finally {
      URL.revokeObjectURL(objectUrl);
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-[#181818] rounded-3xl p-6 border border-white/10 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-yt-subtext uppercase tracking-wider">Account</span>
          <button
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white transition-colors"
            aria-label="Close Account Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile Card */}
        <div className="flex items-start space-x-4 p-4 rounded-2xl bg-neutral-900/80 border border-white/5">
          <div className="flex-shrink-0">
            {previewUrl ? (
              <div className="w-16 h-16 rounded-full overflow-hidden bg-neutral-800 ring-2 ring-white/20 flex items-center justify-center shadow-lg">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
              </div>
            ) : (
              <UserAvatar user={user} size={64} ringClass="ring-2 ring-white/20 shadow-lg" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white truncate">{displayName}</h2>
            <p className="text-xs text-yt-subtext truncate">@{user.username}</p>
            <div className="flex items-center space-x-1 text-[10px] text-emerald-400 font-semibold mt-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Session Active</span>
            </div>
          </div>
        </div>

        {/* Upload Profile Photo */}
        <div className="space-y-2">
          <button
            onClick={triggerPick}
            disabled={uploading}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-white text-black text-xs font-bold shadow-md hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Uploading...</span>
              </>
            ) : user.avatarUrl ? (
              <>
                <Camera className="w-4 h-4" />
                <span>Change Profile Photo</span>
              </>
            ) : (
              <>
                <ImagePlus className="w-4 h-4" />
                <span>Add Profile Photo</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={getImageAccept()}
            className="hidden"
            onChange={handleSelect}
          />

          {uploadError && (
            <div className="flex items-start space-x-2 px-3 py-2 rounded-xl bg-red-950/50 border border-red-800/40 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        {/* Account Details */}
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/40 text-xs">
            <span className="text-neutral-400">User ID</span>
            <span className="font-mono text-white">{user.id}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/40 text-xs">
            <span className="text-neutral-400">Platform</span>
            <span className="font-medium text-white">LocalTune Mobile V3</span>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2">
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-red-950/60 hover:bg-red-900/80 border border-red-800/40 text-red-300 text-xs font-bold transition-colors shadow-md"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
