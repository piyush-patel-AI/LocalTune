/**
 * server/scanner.js
 *
 * Library scanning & reconciliation with Supabase Storage as the media store.
 *
 * Modes:
 *  1. Storage configured (production):
 *     - Lists all `music/` objects in the bucket and reconciles PostgreSQL:
 *       new/changed objects are parsed in-memory, embedded artwork is
 *       extracted and uploaded under `artworks/<trackId>.<ext>`, and rows
 *       whose object no longer exists are removed.
 *     - If local music directories are provided AND exist (dev machine),
 *       their files are first ingested into Storage (`music/Artist/Album/filename.ext`)
 *       so new music always lands in the bucket instead of server/music/.
 *  2. Storage not configured (local dev fallback):
 *     - Legacy behaviour: walk local dirs, index by absolute file path.
 */

import fs from 'fs';
import path from 'path';
import { parseBuffer } from 'music-metadata';
import {
  upsertTrack,
  deleteTrackByPath,
  getAllTracks,
  getMissingMetadataTracks,
  updateTrackMetadata,
  setTrackArtwork,
  getTrackByPath,
  getTrackScanInfoByPath,
  rekeyTrack
} from './db.js';
import {
  isStorageConfigured,
  uploadToStorage,
  getBufferFromStorage,
  listStorageObjects,
  listAllAudioObjects,
  buildAudioKey,
  buildArtworkKey,
  extFromMime,
  mimeFromExt,
  isLocalPath
} from './storage.js';
import { normalizeGenre } from './genreNormalizer.js';

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

// Helper: Recursively discover audio files (local ingestion mode)
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

/** Simple concurrency limiter so we don't hammer storage with hundreds of parallel GETs. */
async function runWithConcurrency(items, limit, fn) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// --- Metadata parsing core ---

function extractReleaseType(album, commonReleasetype) {
  let releaseType = 'album';
  if (commonReleasetype && typeof commonReleasetype === 'string') {
    const rt = commonReleasetype.toLowerCase();
    if (rt.includes('ep')) releaseType = 'ep';
    else if (rt.includes('single')) releaseType = 'single';
  } else if (album && typeof album === 'string') {
    const alb = album.toLowerCase();
    if (alb.includes(' - ep') || alb.endsWith(' ep') || alb.includes(' (ep)')) releaseType = 'ep';
    else if (alb.includes(' - single') || alb.endsWith(' single') || alb.includes(' (single)')) releaseType = 'single';
  }
  return releaseType;
}

/**
 * Parse metadata from an in-memory buffer.
 * Returns { title, artist, album, releaseType, durationSeconds, genre, year, format, embeddedArt }.
 */
export const parseAudioBuffer = async (buffer, filename = 'audio.mp3') => {
  const ext = path.extname(filename).toLowerCase();
  const formatStr = ext.replace('.', '') || 'mp3';
  const mimeType = extToMime(ext);

  let title = path.basename(filename, ext);
  let artist = 'Unknown Artist';
  let album = 'Unknown Album';
  let releaseType = 'album';
  let durationSeconds = 0;
  let genre = null;
  let year = null;
  let rawReleasetype = null;
  let embeddedArt = null;

  try {
    const metadata = await parseBuffer(buffer, { mimeType });
    if (metadata && metadata.common) {
      if (metadata.common.title && metadata.common.title.trim()) {
        title = metadata.common.title.trim();
      }
      if (metadata.common.artist && metadata.common.artist.trim()) {
        artist = metadata.common.artist.trim();
      }
      if (metadata.common.album && metadata.common.album.trim()) {
        album = metadata.common.album.trim();
      }
      if (metadata.common.genre) {
        const rawGenre = Array.isArray(metadata.common.genre)
          ? metadata.common.genre.join(', ')
          : metadata.common.genre;
        genre = normalizeGenre(rawGenre);
      }
      if (metadata.common.year) {
        year = parseInt(metadata.common.year, 10) || null;
      }
      rawReleasetype = metadata.common.releasetype || null;
      if (metadata.format && metadata.format.duration) {
        durationSeconds = Math.round(metadata.format.duration);
      }
      // Extract embedded cover art (first picture)
      const pictures = metadata.common.picture;
      if (pictures && pictures.length > 0) {
        const pic = pictures[0];
        embeddedArt = {
          data: Buffer.from(pic.data),
          mime: pic.format || 'image/jpeg'
        };
      }
    }
  } catch (parseErr) {
    console.warn(`[Scanner Warning] Could not parse tags for '${filename}'. Using fallbacks. Error: ${parseErr.message}`);
  }

  releaseType = extractReleaseType(album, rawReleasetype);

  return {
    title,
    artist,
    album,
    releaseType,
    durationSeconds,
    genre,
    year,
    format: formatStr,
    embeddedArt
  };
};

const extToMime = (ext) => {
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.flac': return 'audio/flac';
    case '.wav': return 'audio/wav';
    case '.m4a': return 'audio/mp4';
    default: return 'audio/mpeg';
  }
};

// Parse single local audio file safely with try/catch (legacy/dev helper)
export const parseAudioFile = async (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    const buffer = fs.readFileSync(filePath);
    const parsed = await parseAudioBuffer(buffer, path.basename(filePath));
    return {
      ...parsed,
      filePath,
      fileSize: stats.size,
      dateModified: stats.mtime.toISOString()
    };
  } catch (err) {
    console.error(`[Scanner Error] Failed reading stats for file '${filePath}':`, err.message);
    return null;
  }
};

// Rescan Metadata Only (for tracks missing genre or year)
export const scanMissingMetadata = async () => {
  const missingTracks = await getMissingMetadataTracks();
  console.log(`[Scanner] Found ${missingTracks.length} tracks with missing genre/year metadata to rescan.`);

  let updatedCount = 0;
  for (const track of missingTracks) {
    try {
      let parsed = null;
      const storageKey = track.b2_key || (!isLocalPath(track.file_path) ? track.file_path : null);

      if (storageKey && isStorageConfigured()) {
        const buffer = await getBufferFromStorage(storageKey);
        if (buffer) {
          parsed = await parseAudioBuffer(buffer, path.basename(storageKey));
        }
      } else if (track.file_path && isLocalPath(track.file_path) && fs.existsSync(track.file_path)) {
        parsed = await parseAudioFile(track.file_path);
      }

      if (parsed && (parsed.genre || parsed.year)) {
        await updateTrackMetadata(track.id, {
          genre: parsed.genre || track.genre,
          year: parsed.year || track.year
        });
        updatedCount++;
      }
    } catch (e) {
      console.warn(`[Scanner] Rescan missing metadata failed for track #${track.id}:`, e.message);
    }
  }

  console.log(`[Scanner] Rescanned missing metadata for ${updatedCount} tracks.`);
  return { scannedCount: missingTracks.length, updatedCount };
};

// --- Artwork extraction & upload ---

/** Upload embedded artwork for a track to storage and link it in PostgreSQL. */
const saveEmbeddedArtwork = async (trackId, embeddedArt) => {
  if (!embeddedArt || !embeddedArt.data) return false;
  const key = buildArtworkKey(trackId, extFromMime(embeddedArt.mime));
  await uploadToStorage(key, embeddedArt.data, embeddedArt.mime || 'image/jpeg');
  await setTrackArtwork(trackId, key, key);
  return true;
};

// --- Cloud scan ---

/** Reconcile PostgreSQL against the contents of the storage bucket (`music/` prefix). */
const reconcileStorageLibrary = async () => {
  const audioObjects = await listAllAudioObjects('music');
  const storageMap = new Map();
  for (const obj of audioObjects) {
    storageMap.set(obj.path, obj);
  }
  console.log(`[Scanner] Found ${storageMap.size} audio object(s) in storage bucket.`);

  // 1. Remove DB rows whose storage object no longer exists
  const existingDbTracks = await getAllTracks();
  for (const dbTrack of existingDbTracks) {
    const storageKey = dbTrack.b2_key || dbTrack.file_path;
    if (!storageMap.has(storageKey)) {
      // Keep legacy local-disk rows whose file still exists (dev machines mid-migration)
      if (isLocalPath(dbTrack.file_path) && fs.existsSync(dbTrack.file_path)) {
        continue;
      }
      console.log(`[Scanner] Removing stale track from DB (not in storage): ${dbTrack.file_path}`);
      await deleteTrackByPath(dbTrack.file_path);
    }
  }

  // 2. Process new or changed storage objects
  const toProcess = [];
  for (const [key, obj] of storageMap.entries()) {
    const dbTrack = await getTrackScanInfoByPath(key);
    const lastModified = obj.updated_at || obj.created_at;
    const size = obj.metadata?.size || 0;

    const isNew = !dbTrack;
    const isChanged =
      dbTrack &&
      ((size > 0 && dbTrack.file_size !== size) ||
        (lastModified && new Date(lastModified) > new Date(dbTrack.date_modified)));

    if (isNew || isChanged) {
      toProcess.push({ key, size, lastModified });
    }
  }
  scanState.totalCount = toProcess.length;
  console.log(`[Scanner] ${toProcess.length} new/changed storage object(s) to index.`);

  await runWithConcurrency(toProcess, 4, async ({ key, size, lastModified }) => {
    try {
      const buffer = await getBufferFromStorage(key);
      if (!buffer) {
        console.warn(`[Scanner] Could not download: ${key}`);
        scanState.errorCount++;
        return;
      }
      const parsed = await parseAudioBuffer(buffer, path.basename(key));

      const trackId = await upsertTrack({
        filePath: key,
        title: parsed.title,
        artist: parsed.artist,
        album: parsed.album,
        releaseType: parsed.releaseType,
        genre: parsed.genre,
        year: parsed.year,
        durationSeconds: parsed.durationSeconds,
        format: parsed.format,
        fileSize: size,
        dateModified: lastModified || new Date().toISOString()
      });

      // Only extract embedded art if the track has no artwork yet
      const current = await getTrackByPath(key);
      if (current && !current.cover_art_path && parsed.embeddedArt) {
        await saveEmbeddedArtwork(trackId, parsed.embeddedArt);
      }
    } catch (err) {
      console.error(`[Scanner Error] Failed indexing storage object '${key}':`, err.message);
      scanState.errorCount++;
    } finally {
      scanState.scannedCount++;
    }
  });
};

// --- Local dir -> Storage ingestion (dev machines with storage configured) ---

const ingestLocalDirIntoStorage = async (dirs) => {
  let allDiskFiles = [];
  for (const dir of dirs) {
    allDiskFiles.push(...walkDirectory(dir));
  }
  allDiskFiles = Array.from(new Set(allDiskFiles));

  if (allDiskFiles.length === 0) return;

  console.log(`[Scanner] Ingesting up to ${allDiskFiles.length} local file(s) into storage...`);

  for (const filePath of allDiskFiles) {
    try {
      const filename = path.basename(filePath);
      const stats = fs.statSync(filePath);
      const diskMtime = stats.mtime.toISOString();

      // Peek at tags first to derive Artist/Album folder structure for the key
      const parsed = await parseAudioFile(filePath);
      if (!parsed) {
        scanState.errorCount++;
        continue;
      }

      const targetKey = buildAudioKey(parsed.artist, parsed.album, filename);
      const existingAtKey = await getTrackByPath(targetKey);

      // Skip if already indexed under its storage key and unchanged
      if (existingAtKey && !(new Date(diskMtime) > new Date(existingAtKey.date_modified) && stats.size !== existingAtKey.file_size)) {
        continue;
      }

      const buffer = fs.readFileSync(filePath);
      await uploadToStorage(targetKey, buffer, extToMime(path.extname(filename).toLowerCase()));

      // Migrate an existing legacy row in place — keeps the track id so
      // playlists and favorites survive the move to storage keys.
      const legacyRow = await getTrackByPath(filePath);
      if (legacyRow) {
        await rekeyTrack(filePath, targetKey, stats.size, diskMtime);

        // Migrate local cover art into the bucket as well
        const coverPath = legacyRow.cover_art_path;
        if (coverPath && isLocalPath(coverPath) && fs.existsSync(coverPath)) {
          const artExt = path.extname(coverPath).toLowerCase() || '.jpg';
          const artKey = buildArtworkKey(legacyRow.id, artExt);
          await uploadToStorage(artKey, fs.readFileSync(coverPath), mimeFromExt(artExt));
          await setTrackArtwork(legacyRow.id, artKey, artKey);
        }
        continue;
      }

      // Brand new track
      const trackId = await upsertTrack({
        filePath: targetKey,
        title: parsed.title,
        artist: parsed.artist,
        album: parsed.album,
        releaseType: parsed.releaseType,
        genre: parsed.genre,
        year: parsed.year,
        durationSeconds: parsed.durationSeconds,
        format: parsed.format,
        fileSize: stats.size,
        dateModified: diskMtime
      });

      const current = await getTrackByPath(targetKey);
      if (current && !current.cover_art_path && parsed.embeddedArt) {
        await saveEmbeddedArtwork(trackId, parsed.embeddedArt);
      }
    } catch (err) {
      console.error(`[Scanner Error] Skipping unreadable file: ${filePath}. Error:`, err.message);
      scanState.errorCount++;
    } finally {
      scanState.scannedCount++;
    }
  }
};

// --- Legacy local scan (no storage configured) ---

const legacyLocalScan = async (dirs) => {
  let allDiskFiles = [];
  for (const dir of dirs) {
    allDiskFiles.push(...walkDirectory(dir));
  }
  allDiskFiles = Array.from(new Set(allDiskFiles));
  scanState.totalCount = allDiskFiles.length;

  console.log(`[Scanner] Discovered ${allDiskFiles.length} audio files across configured directories.`);

  // Reconcile deleted files
  const existingDbTracks = await getAllTracks();
  const diskFileSet = new Set(allDiskFiles);

  for (const dbTrack of existingDbTracks) {
    if (!diskFileSet.has(dbTrack.file_path) && isLocalPath(dbTrack.file_path)) {
      console.log(`[Scanner] Removing missing track from DB: ${dbTrack.file_path}`);
      await deleteTrackByPath(dbTrack.file_path);
    }
  }

  for (const filePath of allDiskFiles) {
    try {
      const dbTrack = await getTrackScanInfoByPath(filePath);
      const stats = fs.statSync(filePath);
      const diskMtime = stats.mtime.toISOString();

      if (!dbTrack || new Date(diskMtime) > new Date(dbTrack.date_modified)) {
        const trackData = await parseAudioFile(filePath);
        if (trackData) {
          await upsertTrack(trackData);
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
    const dirs = Array.isArray(musicDirs) ? musicDirs : (musicDirs ? [musicDirs] : []);

    if (isStorageConfigured()) {
      // 1. Optionally ingest local files into storage (dev machine flow)
      if (dirs.length > 0) {
        await ingestLocalDirIntoStorage(dirs);
      }
      // 2. Always reconcile DB against the bucket (production flow)
      await reconcileStorageLibrary();
    } else {
      await legacyLocalScan(dirs);
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
