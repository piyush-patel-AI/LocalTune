import fs from 'fs';
import path from 'path';
import { parseFile } from 'music-metadata';
import db, { upsertTrack, deleteTrackByPath, getAllTracks } from './db.js';

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.flac', '.wav', '.m4a']);

// In-memory status state
let scanState = {
  isScanning: false,
  scannedCount: 0,
  totalCount: 0,
  lastScanTime: null,
  errorCount: 0
};

export const getScanStatus = () => {
  return { ...scanState };
};

// Helper: Recursively discover audio files
const walkDirectory = (dir, fileList = []) => {
  if (!fs.existsSync(dir)) return fileList;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDirectory(fullPath, fileList);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (ALLOWED_EXTENSIONS.has(ext)) {
        fileList.push(fullPath);
      }
    }
  }

  return fileList;
};

// Parse single audio file safely with try/catch
export const parseAudioFile = async (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const formatStr = ext.replace('.', '');
    const filenameNoExt = path.basename(filePath, ext);

    let title = filenameNoExt;
    let artist = 'Unknown Artist';
    let album = 'Unknown Album';
    let releaseType = 'album';
    let durationSeconds = 0;

    try {
      const metadata = await parseFile(filePath);
      if (metadata.common) {
        if (metadata.common.title && metadata.common.title.trim()) {
          title = metadata.common.title.trim();
        }
        if (metadata.common.artist && metadata.common.artist.trim()) {
          artist = metadata.common.artist.trim();
        }
        if (metadata.common.album && metadata.common.album.trim()) {
          album = metadata.common.album.trim();
        }
        if (metadata.common.releasetype && typeof metadata.common.releasetype === 'string') {
          const rt = metadata.common.releasetype.toLowerCase();
          if (rt.includes('ep')) releaseType = 'ep';
          else if (rt.includes('single')) releaseType = 'single';
        }
      }
      if (album.match(/\bEP\b/i) || album.toLowerCase().includes('(ep)') || album.toLowerCase().includes('[ep]')) {
        releaseType = 'ep';
      } else if (album.match(/\bSingle\b/i) || album.toLowerCase().includes('(single)')) {
        releaseType = 'single';
      }
      if (metadata.format && metadata.format.duration) {
        durationSeconds = Math.round(metadata.format.duration);
      }
    } catch (parseErr) {
      console.warn(`[Scanner Warning] Could not parse tags for '${filePath}'. Using fallbacks. Error: ${parseErr.message}`);
    }

    return {
      filePath,
      title,
      artist,
      album,
      releaseType,
      durationSeconds,
      format: formatStr,
      fileSize: stats.size,
      dateModified: stats.mtime.toISOString()
    };
  } catch (err) {
    console.error(`[Scanner Error] Failed reading stats for file '${filePath}':`, err.message);
    return null;
  }
};

// Perform complete library scan and reconciliation
export const scanLibrary = async (musicDirs) => {
  if (scanState.isScanning) {
    return scanState;
  }

  scanState.isScanning = true;
  scanState.scannedCount = 0;
  scanState.totalCount = 0;
  scanState.errorCount = 0;

  try {
    const dirs = Array.isArray(musicDirs) ? musicDirs : [musicDirs];
    let allDiskFiles = [];

    for (const dir of dirs) {
      const discovered = walkDirectory(dir);
      allDiskFiles.push(...discovered);
    }

    // Deduplicate paths
    allDiskFiles = Array.from(new Set(allDiskFiles));
    scanState.totalCount = allDiskFiles.length;

    console.log(`[Scanner] Discovered ${allDiskFiles.length} audio files across configured directories.`);

    // 1. Reconcile deleted files: find tracks in DB no longer present on disk
    const existingDbTracks = getAllTracks();
    const diskFileSet = new Set(allDiskFiles);

    for (const dbTrack of existingDbTracks) {
      if (!diskFileSet.has(dbTrack.file_path)) {
        console.log(`[Scanner] Removing missing track from DB: ${dbTrack.file_path}`);
        deleteTrackByPath(dbTrack.file_path);
      }
    }

    // 2. Process discovered files
    for (const filePath of allDiskFiles) {
      try {
        const dbTrack = db.prepare(`SELECT id, date_modified FROM tracks WHERE file_path = ?`).get(filePath);
        const stats = fs.statSync(filePath);
        const diskMtime = stats.mtime.toISOString();

        // Parse if new file or modified since last scan
        if (!dbTrack || new Date(diskMtime) > new Date(dbTrack.date_modified)) {
          const trackData = await parseAudioFile(filePath);
          if (trackData) {
            upsertTrack(trackData);
          } else {
            scanState.errorCount++;
          }
        }
      } catch (fileErr) {
        console.error(`[Scanner Error] Skipping corrupt or unreadable file: ${filePath}. Error:`, fileErr.message);
        scanState.errorCount++;
      } finally {
        scanState.scannedCount++;
      }
    }

    scanState.lastScanTime = new Date().toISOString();
    console.log(`[Scanner] Completed scan. Scanned: ${scanState.scannedCount}/${scanState.totalCount}, Errors: ${scanState.errorCount}`);
  } catch (err) {
    console.error('[Scanner Fatal Error] Library scan encountered an unexpected error:', err.message);
  } finally {
    scanState.isScanning = false;
  }

  return scanState;
};
