import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { parseAudioBuffer, scanLibrary } from './scanner.js';
import {
  upsertTrack,
  upsertArtistImage,
  getArtists,
  findTrackByTitleAndArtist,
  getAllTracks,
  updateTrackMetadata,
  resetTrackMetadata,
  setTrackArtwork,
  rekeyTrack,
  initDatabase
} from './db.js';
import { normalizeGenre } from './genreNormalizer.js';
import {
  isB2Configured,
  uploadToB2,
  uploadToB2Verified,
  buildAudioKey,
  buildArtworkKey,
  buildArtistKey,
  extFromMime
} from './b2.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const UPLOAD_PORT = process.env.UPLOAD_PORT || 5050;
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(__dirname, 'music');
const ARTWORKS_DIR = path.join(MUSIC_DIR, 'artworks');
const ARTISTS_DIR = path.join(MUSIC_DIR, 'artists');

// Local fallback directories (only used when B2 is not configured)
if (!isB2Configured()) {
  if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true });
  if (!fs.existsSync(ARTWORKS_DIR)) fs.mkdirSync(ARTWORKS_DIR, { recursive: true });
  if (!fs.existsSync(ARTISTS_DIR)) fs.mkdirSync(ARTISTS_DIR, { recursive: true });
}

// Keep files in memory — they are streamed straight to Backblaze B2.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max per file
});

// Shared router for uploader routes — mounted on the main Express server in
// production OR used directly by the standalone uploader app in development.
export const uploaderRouter = express.Router();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const AUDIO_MIME = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4'
};

/** Persist an image buffer either to B2 (returns key) or local disk (returns abs path). */
async function saveImageBuffer(buffer, mimetype, b2Key, localDir, localName, cid) {
  if (isB2Configured()) {
    await uploadToB2Verified(b2Key, buffer, mimetype || 'image/jpeg', cid);
    return b2Key;
  }
  const ext = extFromMime(mimetype);
  const localPath = path.join(localDir, `${localName}${ext}`);
  fs.writeFileSync(localPath, buffer);
  return localPath;
}

// GET /api/artists - List all registered artists for autocomplete
uploaderRouter.get('/api/artists', async (req, res) => {
  try {
    const artists = await getArtists();
    res.json({ artists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/manage-tracks - Get all tracks for editing
uploaderRouter.get('/api/manage-tracks', async (req, res) => {
  try {
    const tracks = await getAllTracks();
    res.json({ tracks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manage-tracks/:id - Update track metadata from upload portal
uploaderRouter.post('/api/manage-tracks/:id', async (req, res) => {
  try {
    const trackId = parseInt(req.params.id, 10);
    const { title, artist, album, genre, year } = req.body;
    const normGenre = genre ? normalizeGenre(genre) : null;
    const updated = await updateTrackMetadata(trackId, {
      title,
      artist,
      album,
      genre: normGenre,
      year: year ? parseInt(year, 10) : null
    });
    if (!updated) return res.status(404).json({ error: 'Track not found' });
    res.json({ success: true, track: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/manage-tracks/:id/reset - Reset track metadata
uploaderRouter.post('/api/manage-tracks/:id/reset', async (req, res) => {
  try {
    const trackId = parseInt(req.params.id, 10);
    const resetTrack = await resetTrackMetadata(trackId);
    if (!resetTrack) return res.status(404).json({ error: 'Track not found' });
    res.json({ success: true, track: resetTrack });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /upload-artist - Create/Update Artist Profile without uploading a song
uploaderRouter.post('/upload-artist', upload.single('artistImage'), async (req, res) => {
  const cid = `upa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const log = (...args) => console.log(`[UploadArtist][${cid}]`, ...args);
  const logErr = (...args) => console.error(`[UploadArtist][${cid}]`, ...args);

  try {
    const artistName = req.body.artistName ? req.body.artistName.trim() : '';
    if (!artistName) {
      return res.status(400).json({ error: 'Artist Name is required' });
    }

    const artistImgFile = req.file;
    if (!artistImgFile) {
      return res.status(400).json({ error: 'Artist profile image is required' });
    }

    log('request received artist=%s file=%s size=%d', artistName, artistImgFile.originalname, artistImgFile.size);

    let imagePath;
    try {
      imagePath = await saveImageBuffer(
        artistImgFile.buffer,
        artistImgFile.mimetype,
        buildArtistKey(artistName, extFromMime(artistImgFile.mimetype)),
        ARTISTS_DIR,
        `artist_${Date.now()}-${Math.round(Math.random() * 1e4)}`,
        cid
      );
    } catch (upErr) {
      logErr('stage=b2_artist_img_upload FAILED error=%s', upErr.message);
      return res.status(502).json({ error: 'Failed to store artist image in object storage.', stage: 'b2_artist_img_upload', detail: upErr.message });
    }

    await upsertArtistImage(artistName, imagePath, isB2Configured() ? imagePath : null);
    log('complete artist=%s', artistName);

    return res.json({
      success: true,
      message: `Artist profile for "${artistName}" saved successfully!`,
      artist: {
        name: artistName,
        imagePath: imagePath
      }
    });

  } catch (err) {
    logErr('unhandled error error=%s', err.message);
    return res.status(500).json({ error: 'Failed to save artist profile: ' + err.message });
  }
});

export const uploadFieldsMiddleware = upload.fields([
  { name: 'audioFile', maxCount: 1 },
  { name: 'coverArt', maxCount: 1 },
  { name: 'artistImage', maxCount: 1 }
]);

export const handleUploadTrack = async (req, res) => {
  // Correlation id — every log line in this request carries this tag.
  const cid = `upl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const log = (...args) => console.log(`[Upload][${cid}]`, ...args);
  const logErr = (...args) => console.error(`[Upload][${cid}]`, ...args);

  const t0 = Date.now();
  try {
    if (!req.files || !req.files.audioFile || req.files.audioFile.length === 0) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const audioFile = req.files.audioFile[0];
    const coverArtFile = req.files.coverArt ? req.files.coverArt[0] : null;
    const artistImgFile = req.files.artistImage ? req.files.artistImage[0] : null;

    log('request received filename=%s size=%d bytes type=%s', audioFile.originalname, audioFile.size, audioFile.mimetype);

    // ── Stage 1: Parse audio metadata ──
    log('stage=parse_meta start');
    const parsed = await parseAudioBuffer(audioFile.buffer, audioFile.originalname);
    log('stage=parse_meta ok title=%s artist=%s album=%s duration=%s',
      parsed.title, parsed.artist, parsed.album, parsed.durationSeconds);

    // Custom metadata overrides from form input if provided
    const customTitle = req.body.title ? req.body.title.trim() : '';
    let customArtist = req.body.artist ? req.body.artist.trim() : '';
    const customAlbum = req.body.album ? req.body.album.trim() : '';

    // Process collaboration artists if provided
    let rawCollabs = req.body['collaborators[]'] || req.body.collaborators || [];
    if (typeof rawCollabs === 'string') rawCollabs = [rawCollabs];
    const collaborators = rawCollabs.map(c => c.trim()).filter(c => c.length > 0);
    const collabMode = req.body.collabMode || 'feat';

    if (customArtist && collaborators.length > 0) {
      if (collabMode === 'feat') {
        customArtist = `${customArtist} feat. ${collaborators.join(' & ')}`;
      } else if (collabMode === 'and') {
        customArtist = `${customArtist} & ${collaborators.join(' & ')}`;
      } else if (collabMode === 'comma') {
        customArtist = `${customArtist}, ${collaborators.join(', ')}`;
      }
    }

    const finalTitle = customTitle || parsed.title || path.basename(audioFile.originalname, path.extname(audioFile.originalname));
    const finalArtist = customArtist || parsed.artist || 'Unknown Artist';
    const finalAlbum = customAlbum || parsed.album || 'Unknown Album';
    const finalReleaseType = (req.body.releaseType || req.body.release_type || parsed.releaseType || 'album').toLowerCase();
    const finalGenre = req.body.genre ? normalizeGenre(req.body.genre) : (parsed.genre || null);
    const finalYear = req.body.year ? parseInt(req.body.year, 10) : (parsed.year || null);
    const ext = path.extname(audioFile.originalname).replace('.', '').toLowerCase();

    log('resolved title=%s artist=%s album=%s genre=%s year=%s ext=%s', finalTitle, finalArtist, finalAlbum, finalGenre, finalYear, ext);

    // ── Stage 2: Duplicate detection ──
    const existingDuplicate = await findTrackByTitleAndArtist(finalTitle, finalArtist);
    const forceNewRecord = req.body.allowDuplicate === 'true';
    log('stage=dedup existing_id=%s force_new=%s', existingDuplicate?.id ?? 'none', forceNewRecord);

    let coverArtRef = null;
    let artistImgRef = null;
    let newTrackId;
    let adoptedExisting = false;

    if (isB2Configured()) {
      // --- Backblaze B2 storage ---
      const cleanName = path.basename(audioFile.originalname, path.extname(audioFile.originalname))
        .replace(/[^a-zA-Z0-9_\-]/g, '_');
      const audioKey = buildAudioKey(finalArtist, finalAlbum, `${cleanName}.${ext}`);
      const contentType = AUDIO_MIME[`.${ext}`] || 'application/octet-stream';

      if (existingDuplicate && !forceNewRecord) {
        // ── ADOPT MODE ──
        log('stage=b2_audio_upload mode=adopt key=%s', audioKey);
        try {
          await uploadToB2Verified(audioKey, audioFile.buffer, contentType, cid);
        } catch (b2Err) {
          logErr('stage=b2_audio_upload FAILED key=%s error=%s', audioKey, b2Err.message);
          return res.status(502).json({
            error: 'B2 audio upload failed',
            stage: 'b2_audio_upload',
            detail: b2Err.message
          });
        }

        log('stage=db_rekey old_path=%s new_key=%s', existingDuplicate.file_path, audioKey);
        await rekeyTrack(existingDuplicate.file_path, audioKey, audioFile.size, new Date().toISOString());
        newTrackId = existingDuplicate.id;
        adoptedExisting = true;

        const patch = {};
        if (req.body.title && req.body.title.trim()) patch.title = req.body.title.trim();
        if (req.body.artist && req.body.artist.trim()) patch.artist = req.body.artist.trim();
        if (req.body.album && req.body.album.trim()) patch.album = req.body.album.trim();
        if (req.body.genre && req.body.genre.trim()) patch.genre = normalizeGenre(req.body.genre);
        if (req.body.year) patch.year = parseInt(req.body.year, 10);
        if (Object.keys(patch).length > 0) {
          await updateTrackMetadata(newTrackId, patch);
        }

        const artBufferAdopt = coverArtFile ? coverArtFile.buffer : (parsed.embeddedArt ? parsed.embeddedArt.data : null);
        const artMimeAdopt = coverArtFile ? coverArtFile.mimetype : (parsed.embeddedArt ? parsed.embeddedArt.mime : null);
        if (artBufferAdopt) {
          const artKey = buildArtworkKey(newTrackId, extFromMime(artMimeAdopt));
          log('stage=b2_artwork_upload key=%s', artKey);
          try {
            await uploadToB2Verified(artKey, artBufferAdopt, artMimeAdopt || 'image/jpeg', cid);
          } catch (b2Err) {
            logErr('stage=b2_artwork_upload FAILED key=%s error=%s (non-fatal, continuing)', artKey, b2Err.message);
          }
          await setTrackArtwork(newTrackId, artKey, artKey);
          coverArtRef = artKey;
        }

        const primaryArtistAdopt = req.body.artist ? req.body.artist.trim() : parsed.artist;
        if (primaryArtistAdopt && artistImgFile) {
          const imgKey = buildArtistKey(primaryArtistAdopt, extFromMime(artistImgFile.mimetype));
          log('stage=b2_artist_img_upload key=%s', imgKey);
          try {
            await uploadToB2Verified(imgKey, artistImgFile.buffer, artistImgFile.mimetype || 'image/jpeg', cid);
          } catch (b2Err) {
            logErr('stage=b2_artist_img_upload FAILED key=%s error=%s (non-fatal, continuing)', imgKey, b2Err.message);
          }
          await upsertArtistImage(primaryArtistAdopt, imgKey, imgKey);
          artistImgRef = imgKey;
        }
      } else {
        // ── NEW RECORD ──
        // 1. Upload audio bytes to B2 (must succeed before any DB write)
        log('stage=b2_audio_upload mode=new key=%s', audioKey);
        try {
          await uploadToB2Verified(audioKey, audioFile.buffer, contentType, cid);
        } catch (b2Err) {
          logErr('stage=b2_audio_upload FAILED key=%s error=%s', audioKey, b2Err.message);
          return res.status(502).json({
            error: 'B2 audio upload failed',
            stage: 'b2_audio_upload',
            detail: b2Err.message
          });
        }

        // 2. Index the track — only after B2 upload + verification succeeded
        log('stage=db_insert start key=%s', audioKey);
        newTrackId = await upsertTrack({
          filePath: audioKey,
          title: finalTitle,
          artist: finalArtist,
          album: finalAlbum,
          releaseType: finalReleaseType,
          genre: finalGenre,
          year: finalYear,
          durationSeconds: parsed.durationSeconds || 0,
          format: ext,
          fileSize: audioFile.size,
          dateModified: new Date().toISOString()
        });
        log('stage=db_insert ok track_id=%d', newTrackId);

        // 3. Cover art: explicit upload wins over embedded tag art
        const artBuffer = coverArtFile ? coverArtFile.buffer : (parsed.embeddedArt ? parsed.embeddedArt.data : null);
        const artMime = coverArtFile ? coverArtFile.mimetype : (parsed.embeddedArt ? parsed.embeddedArt.mime : null);
        if (artBuffer) {
          const artKey = buildArtworkKey(newTrackId, extFromMime(artMime));
          log('stage=b2_artwork_upload key=%s', artKey);
          try {
            await uploadToB2Verified(artKey, artBuffer, artMime || 'image/jpeg', cid);
            await setTrackArtwork(newTrackId, artKey, artKey);
            coverArtRef = artKey;
          } catch (b2Err) {
            logErr('stage=b2_artwork_upload FAILED key=%s error=%s (non-fatal, track already saved)', artKey, b2Err.message);
          }
        }

        // 4. Primary artist image
        const primaryArtist = req.body.artist ? req.body.artist.trim() : parsed.artist;
        if (primaryArtist && artistImgFile) {
          const imgKey = buildArtistKey(primaryArtist, extFromMime(artistImgFile.mimetype));
          log('stage=b2_artist_img_upload key=%s', imgKey);
          try {
            await uploadToB2Verified(imgKey, artistImgFile.buffer, artistImgFile.mimetype || 'image/jpeg', cid);
            await upsertArtistImage(primaryArtist, imgKey, imgKey);
            artistImgRef = imgKey;
          } catch (b2Err) {
            logErr('stage=b2_artist_img_upload FAILED key=%s error=%s (non-fatal, track already saved)', imgKey, b2Err.message);
          }
        }
      }

    } else {
      // --- Local disk fallback (development without B2 credentials) ---
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
      const cleanName = path.basename(audioFile.originalname, path.extname(audioFile.originalname))
        .replace(/[^a-zA-Z0-9_-]/g, '_');

      const audioLocal = path.join(MUSIC_DIR, `${cleanName}_${uniqueSuffix}.${ext}`);
      fs.writeFileSync(audioLocal, audioFile.buffer);

      let coverLocal = null;
      if (coverArtFile) {
        coverLocal = path.join(ARTWORKS_DIR, `cover_${uniqueSuffix}${path.extname(coverArtFile.originalname).toLowerCase() || '.jpg'}`);
        fs.writeFileSync(coverLocal, coverArtFile.buffer);
      }

      let artistLocal = null;
      const primaryArtist = req.body.artist ? req.body.artist.trim() : parsed.artist;
      if (primaryArtist && artistImgFile) {
        artistLocal = path.join(ARTISTS_DIR, `artist_${uniqueSuffix}${path.extname(artistImgFile.originalname).toLowerCase() || '.jpg'}`);
        fs.writeFileSync(artistLocal, artistImgFile.buffer);
      }

      const trackId = await upsertTrack({
        filePath: audioLocal,
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        releaseType: finalReleaseType,
        genre: finalGenre,
        year: finalYear,
        durationSeconds: parsed.durationSeconds || 0,
        format: ext,
        fileSize: audioFile.size,
        dateModified: new Date().toISOString(),
        coverArtPath: coverLocal
      });
      newTrackId = trackId;

      if (primaryArtist && artistLocal) {
        await upsertArtistImage(primaryArtist, artistLocal);
      }

      coverArtRef = coverLocal;
      artistImgRef = artistLocal;
    }

    // Trigger background reconciliation scan
    scanLibrary(MUSIC_DIR).catch(err => console.error('Post-upload scan error:', err));

    const elapsed = Date.now() - t0;
    log('complete track_id=%d adopted=%s elapsed=%dms', newTrackId, adoptedExisting, elapsed);

    return res.json({
      success: true,
      message: adoptedExisting
        ? 'Song re-uploaded and attached to its existing library entry (track id preserved)!'
        : 'Song uploaded and indexed successfully!',
      adopted: adoptedExisting,
      track: {
        id: newTrackId,
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        releaseType: finalReleaseType,
        format: ext,
        coverArtPath: coverArtRef,
        artistImagePath: artistImgRef
      }
    });
  } catch (err) {
    const elapsed = Date.now() - t0;
    logErr('unhandled error elapsed=%dms error=%s', elapsed, err.message);
    logErr(err.stack);
    return res.status(500).json({ error: 'Failed to upload song: ' + err.message });
  }
};

uploaderRouter.post('/upload', uploadFieldsMiddleware, handleUploadTrack);

// Single Page Upload Interface
function generateUploaderHtml({ uploadUrl = '/upload', webPlayerUrl = '', subtitle = '' } = {}) {
  if (!subtitle) subtitle = `Upload songs & manage artist profiles (Port ${UPLOAD_PORT})`;
  if (!webPlayerUrl) webPlayerUrl = `http://localhost:5173`;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LocalTune — Music & Artist Uploader</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0f172a;
      --bg-card: #1e293b;
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --border: #334155;
      --success: #22c55e;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
    body {
      background: var(--bg-dark);
      color: var(--text);
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 1.5rem;
    }
    .upload-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      width: 100%;
      max-width: 560px;
      padding: 2.25rem;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
    }
    .header {
      text-align: center;
      margin-bottom: 1.5rem;
    }
    .logo {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    .title {
      font-size: 1.5rem;
      font-weight: 700;
    }
    .subtitle {
      font-size: 0.875rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    /* Tabs Styling */
    .tab-bar {
      display: flex;
      gap: 0.5rem;
      background: #0f172a;
      padding: 0.35rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      margin-bottom: 1.5rem;
    }
    .tab-btn {
      flex: 1;
      padding: 0.65rem;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 600;
      border-radius: 0.375rem;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
    }
    .tab-btn.active {
      background: var(--accent);
      color: #fff;
    }

    .dropzone {
      border: 2px dashed var(--border);
      border-radius: 0.75rem;
      padding: 1.25rem;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background-color 0.2s;
      margin-bottom: 1rem;
      position: relative;
    }
    .dropzone:hover, .dropzone.dragover {
      border-color: var(--accent);
      background-color: rgba(99, 102, 241, 0.05);
    }
    .dropzone input {
      position: absolute;
      top: 0; left: 0; width: 100%; height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    .dropzone-icon {
      font-size: 1.75rem;
      margin-bottom: 0.35rem;
    }
    .dropzone-label {
      font-size: 0.9rem;
      font-weight: 500;
    }
    .dropzone-sub {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }
    .file-name-badge {
      display: inline-block;
      margin-top: 0.5rem;
      background: rgba(99, 102, 241, 0.2);
      color: var(--accent);
      padding: 0.25rem 0.65rem;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      font-weight: 600;
      word-break: break-all;
    }
    .grid-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .form-group {
      margin-bottom: 1rem;
    }
    label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    input[type="text"] {
      width: 100%;
      padding: 0.75rem 1rem;
      background: #0f172a;
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      color: #fff;
      font-size: 0.9rem;
      outline: none;
    }
    input[type="text"]:focus {
      border-color: var(--accent);
    }
    .art-preview-box {
      width: 50px;
      height: 50px;
      border-radius: 0.5rem;
      background: #0f172a;
      object-fit: cover;
      border: 1px solid var(--border);
      margin-top: 0.5rem;
      display: none;
    }
    .artist-preview-box {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: #0f172a;
      object-fit: cover;
      border: 1px solid var(--border);
      margin-top: 0.5rem;
      display: none;
    }
    .btn-submit {
      width: 100%;
      padding: 0.85rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-top: 0.5rem;
    }
    .btn-submit:hover {
      background: var(--accent-hover);
    }
    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .progress-bar-wrap {
      width: 100%;
      height: 6px;
      background: #0f172a;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 1rem;
      display: none;
    }
    .progress-bar-fill {
      height: 100%;
      width: 0%;
      background: var(--accent);
      transition: width 0.1s;
    }
    .result-alert {
      margin-top: 1.25rem;
      padding: 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      display: none;
    }
    .result-alert.success {
      background: rgba(34, 197, 94, 0.15);
      border: 1px solid var(--success);
      color: var(--success);
    }
    .result-alert.error {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid #ef4444;
      color: #ef4444;
    }
    .nav-link {
      display: block;
      text-align: center;
      margin-top: 1.25rem;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 0.85rem;
    }
    .nav-link:hover {
      color: var(--text);
    }
    .existing-artist-badge {
      font-size: 0.75rem;
      color: var(--success);
      margin-top: 0.25rem;
      display: none;
    }
  </style>
</head>
<body>
  <div class="upload-card">
    <div class="header">
      <div class="logo">🎵</div>
      <h1 class="title">LocalTune Portal</h1>
      <p class="subtitle">${subtitle}</p>
    </div>

    <!-- Mode Selector Tabs -->
    <div class="tab-bar">
      <button class="tab-btn active" id="tabSongBtn" onclick="switchTab('song')">🎵 Upload Song</button>
      <button class="tab-btn" id="tabArtistBtn" onclick="switchTab('artist')">🎤 Add Artist Profile</button>
      <button class="tab-btn" id="tabManageBtn" onclick="switchTab('manage')">✏️ Edit Songs</button>
    </div>

    <!-- Autocomplete Datalists -->
    <datalist id="existingArtistList"></datalist>
    <datalist id="genreList">
      <option value="Rock"></option>
      <option value="Pop"></option>
      <option value="Hip-Hop"></option>
      <option value="Electronic"></option>
      <option value="R&B"></option>
      <option value="Jazz"></option>
      <option value="Classical"></option>
      <option value="Country"></option>
      <option value="Indie"></option>
      <option value="Metal"></option>
      <option value="Lo-Fi"></option>
      <option value="Bollywood"></option>
      <option value="EDM"></option>
      <option value="Folk"></option>
      <option value="Punk"></option>
      <option value="Blues"></option>
      <option value="Soul"></option>
      <option value="Ambient"></option>
      <option value="Soundtrack"></option>
    </datalist>

    <!-- SECTION 1: Upload Song Form -->
    <form id="uploadSongForm">
      <!-- Audio Dropzone -->
      <div class="dropzone" id="audioDropzone">
        <input type="file" id="audioFileInput" name="audioFile" accept=".mp3,.flac,.wav,.m4a" required>
        <div class="dropzone-icon">🎧</div>
        <div class="dropzone-label">Choose audio file or drag & drop</div>
        <div class="dropzone-sub">Supports MP3, FLAC, WAV, M4A</div>
        <div id="audioNameBadge" class="file-name-badge" style="display:none;"></div>
      </div>

      <!-- Images Grid (Album Cover & Artist Photo) -->
      <div class="grid-row">
        <!-- Album Artwork Dropzone -->
        <div class="dropzone" style="padding: 0.85rem; margin-bottom:0;">
          <input type="file" id="coverArtInput" name="coverArt" accept=".jpg,.jpeg,.png,.webp">
          <div style="font-size: 1.2rem;">🖼️</div>
          <div class="dropzone-label" style="font-size: 0.8rem;">Album Art (Optional)</div>
          <div class="dropzone-sub" style="font-size: 0.7rem;">JPEG, PNG, WEBP</div>
          <center><img id="artPreview" class="art-preview-box" alt="Cover Art Preview"></center>
        </div>

        <!-- Artist Image Dropzone -->
        <div class="dropzone" style="padding: 0.85rem; margin-bottom:0;">
          <input type="file" id="artistImageInput" name="artistImage" accept=".jpg,.jpeg,.png,.webp">
          <div style="font-size: 1.2rem;">🎤</div>
          <div class="dropzone-label" style="font-size: 0.8rem;">New Artist Photo</div>
          <div class="dropzone-sub" style="font-size: 0.7rem;">Overwrites photo</div>
          <center><img id="artistImgPreview" class="artist-preview-box" alt="Artist Photo Preview"></center>
        </div>
      </div>

      <!-- Metadata Fields -->
      <div class="form-group" style="margin-top: 1rem;">
        <label>Song Title</label>
        <input type="text" id="titleInput" name="title" placeholder="Leave empty to use filename/metadata tag">
      </div>

      <div class="grid-row">
        <div class="form-group" style="margin-bottom:0;">
          <label>Primary Artist (Main)</label>
          <input type="text" id="artistInput" name="artist" list="existingArtistList" placeholder="Search or type main artist...">
          <div id="existingArtistBadge" class="existing-artist-badge">✓ Linked to existing artist profile</div>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Album / EP Title</label>
          <input type="text" id="albumInput" name="album" placeholder="e.g. Parachutes or Kaleidoscope EP">
        </div>
      </div>

      <div class="grid-row" style="margin-top: 1rem;">
        <div class="form-group" style="margin-bottom:0; width:100%;">
          <label>Release Year (Optional)</label>
          <input type="text" id="yearInput" name="year" placeholder="e.g. 2024">
        </div>
      </div>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Genres (Select Multiple ✓)</label>
        <input type="hidden" id="genreInput" name="genre" value="">
        <div id="uploadGenrePills" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;"></div>
      </div>

      <div class="form-group" style="margin-top: 1rem;">
        <label>Release Type</label>
        <select name="releaseType" id="releaseTypeSelect" style="width: 100%; padding: 0.75rem 1rem; background: #0f172a; border: 1px solid var(--border); border-radius: 0.5rem; color: #fff; font-size: 0.9rem; outline: none;">
          <option value="album">💿 Studio Album</option>
          <option value="ep">💽 EP (Extended Play)</option>
          <option value="single">🎵 Single</option>
        </select>
      </div>

      <!-- Collaboration Artists Section -->
      <div style="background: rgba(99, 102, 241, 0.08); border: 1px dashed rgba(99, 102, 241, 0.35); border-radius: 0.5rem; padding: 1rem; margin-top: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <label style="margin:0; color: var(--accent); font-size:0.8rem; font-weight:700;">🤝 Collaborating Artists (Optional)</label>
          <select name="collabMode" id="collabModeSelect" style="background: #0f172a; color: #fff; border: 1px solid var(--border); border-radius: 0.35rem; padding: 0.2rem 0.5rem; font-size: 0.75rem; outline: none;">
            <option value="feat">feat. (Featured)</option>
            <option value="and">& (Duet / Co-Lead)</option>
            <option value="comma">, (Comma Separated)</option>
          </select>
        </div>

        <div id="collaboratorsContainer" style="display: flex; flex-direction: column; gap: 0.5rem;"></div>

        <button type="button" id="addCollabBtn" style="margin-top: 0.5rem; background: transparent; border: 1px dashed var(--accent); color: var(--accent); width: 100%; padding: 0.5rem; border-radius: 0.375rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: background 0.2s;">
          + Add Collaborating Artist
        </button>

        <div id="collabPreviewBadge" style="display: none; margin-top: 0.75rem; padding: 0.5rem 0.75rem; background: #0f172a; border-radius: 0.375rem; font-size: 0.78rem; color: var(--text-muted); border: 1px solid var(--border);">
          Artist Tag Preview: <strong id="collabPreviewText" style="color: #fff;"></strong>
        </div>
      </div>

      <button type="submit" id="submitSongBtn" class="btn-submit">Upload Song to LocalTune</button>
    </form>

    <!-- SECTION 2: Add Standalone Artist Profile Form -->
    <form id="uploadArtistForm" style="display: none;">
      <div class="form-group">
        <label>Artist Name</label>
        <input type="text" id="standaloneArtistName" name="artistName" list="existingArtistList" placeholder="e.g. Coldplay, Ed Sheeran, A.R. Rahman" required>
      </div>

      <!-- Artist Profile Image Dropzone -->
      <div class="dropzone" style="padding: 1.5rem; margin-bottom: 1rem;">
        <input type="file" id="standaloneArtistImgInput" name="artistImage" accept=".jpg,.jpeg,.png,.webp" required>
        <div class="dropzone-icon">📸</div>
        <div class="dropzone-label">Upload Artist Profile Photo</div>
        <div class="dropzone-sub">JPEG, PNG, WEBP (Square format recommended)</div>
        <center><img id="standaloneArtistPreview" class="artist-preview-box" style="width:70px; height:70px;" alt="Artist Photo Preview"></center>
      </div>

      <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom: 1.25rem; text-align:center;">
        💡 <strong>Tip:</strong> Once you add an artist profile here, any future songs uploaded under this artist name will automatically attach to this profile photo!
      </p>

      <button type="submit" id="submitArtistBtn" class="btn-submit">Save Artist Profile</button>
    </form>

    <!-- SECTION 3: Edit Existing Songs Form -->
    <div id="manageSongsForm" style="display: none;">
      <div class="form-group">
        <label>Search & Select Song to Edit</label>
        <input type="text" id="searchTrackInput" placeholder="Type to filter songs..." oninput="filterTrackList()" style="margin-bottom: 0.5rem;">
        <select id="trackSelect" size="5" style="width:100%; padding:0.5rem; background:#0f172a; border:1px solid var(--border); color:#fff; border-radius:0.5rem; outline:none; font-size:0.85rem;" onchange="loadSelectedTrackInfo()">
          <option value="" disabled>Loading tracks...</option>
        </select>
      </div>

      <div id="editFieldsContainer" style="display: none; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; margin-top: 1rem;">
        <div class="form-group">
          <label>Song Title</label>
          <input type="text" id="editTitleInput" placeholder="Song Title">
        </div>

        <div class="grid-row">
          <div class="form-group" style="margin-bottom:0;">
            <label>Artist</label>
            <input type="text" id="editArtistInput" list="existingArtistList" placeholder="Artist Name">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label>Album</label>
            <input type="text" id="editAlbumInput" placeholder="Album Title">
          </div>
        </div>

        <div class="grid-row" style="margin-top: 1rem;">
          <div class="form-group" style="margin-bottom:0; width:100%;">
            <label>Release Year</label>
            <input type="text" id="editYearInput" placeholder="e.g. 2024">
          </div>
        </div>

        <div class="form-group" style="margin-top: 1rem;">
          <label>Genres (Select Multiple ✓)</label>
          <input type="hidden" id="editGenreInput" value="">
          <div id="editGenrePills" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:6px;"></div>
        </div>

        <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
          <button type="button" id="saveEditBtn" onclick="saveTrackMetadata()" class="btn-submit" style="flex:2; margin-top:0;">Save Song Metadata</button>
          <button type="button" id="resetEditBtn" onclick="resetTrackMetadata()" style="flex:1; background: rgba(239,68,68,0.15); border: 1px solid #ef4444; color: #ef4444; border-radius: 0.5rem; font-weight: 600; cursor: pointer; font-size: 0.85rem;">Reset Original</button>
        </div>
      </div>
    </div>

    <div class="progress-bar-wrap" id="progressWrap">
      <div class="progress-bar-fill" id="progressFill"></div>
    </div>

    <div id="resultAlert" class="result-alert"></div>

    <a href="${webPlayerUrl}" target="_blank" class="nav-link">
      🎧 Open LocalTune Web Player &rarr;
    </a>
  </div>

  <script>
    let registeredArtists = [];

    // Fetch existing artists for autocomplete
    async function loadArtists() {
      try {
        const res = await fetch('/api/artists');
        if (res.ok) {
          const data = await res.json();
          registeredArtists = data.artists || [];
          const datalist = document.getElementById('existingArtistList');
          datalist.innerHTML = '';
          registeredArtists.forEach(art => {
            const opt = document.createElement('option');
            opt.value = art.artist;
            datalist.appendChild(opt);
          });
        }
      } catch (err) {
        console.error('Failed to load artists list', err);
      }
    }
    loadArtists();

    let allManageTracks = [];

    // Tab switcher
    function switchTab(mode) {
      document.getElementById('resultAlert').style.display = 'none';
      document.getElementById('tabSongBtn').className = mode === 'song' ? 'tab-btn active' : 'tab-btn';
      document.getElementById('tabArtistBtn').className = mode === 'artist' ? 'tab-btn active' : 'tab-btn';
      document.getElementById('tabManageBtn').className = mode === 'manage' ? 'tab-btn active' : 'tab-btn';

      document.getElementById('uploadSongForm').style.display = mode === 'song' ? 'block' : 'none';
      document.getElementById('uploadArtistForm').style.display = mode === 'artist' ? 'block' : 'none';
      document.getElementById('manageSongsForm').style.display = mode === 'manage' ? 'block' : 'none';

      if (mode === 'manage') {
        loadManageTracks();
      }
    }

    async function loadManageTracks() {
      try {
        const res = await fetch('/api/manage-tracks');
        if (res.ok) {
          const data = await res.json();
          allManageTracks = data.tracks || [];
          filterTrackList();
        }
      } catch (e) {
        console.error('Failed to load manage tracks:', e);
      }
    }

    function filterTrackList() {
      const query = (document.getElementById('searchTrackInput').value || '').toLowerCase();
      const select = document.getElementById('trackSelect');
      select.innerHTML = '';

      const filtered = allManageTracks.filter(t => 
        (t.title || '').toLowerCase().includes(query) ||
        (t.artist || '').toLowerCase().includes(query) ||
        (t.album || '').toLowerCase().includes(query) ||
        (t.genre || '').toLowerCase().includes(query)
      );

      if (filtered.length === 0) {
        const opt = document.createElement('option');
        opt.disabled = true;
        opt.textContent = 'No matching tracks found';
        select.appendChild(opt);
        document.getElementById('editFieldsContainer').style.display = 'none';
        return;
      }

      filtered.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.title + ' — ' + t.artist + (t.genre ? ' [' + t.genre + ']' : '');
        select.appendChild(opt);
      });
    }

    const UPLOADER_GENRES = [
      'Pop', 'Rock', 'Alternative Rock', 'Hip-Hop', 'Rap', 'R&B', 'EDM',
      'House', 'Bollywood', 'Anime', 'Classical', 'Jazz', 'Metal',
      'Country', 'Folk', 'Lo-fi', 'Synthwave'
    ];

    let uploadSelectedGenres = [];
    let editSelectedGenres = [];

    function renderPortalGenrePills(containerId, hiddenInputId, selectedArray) {
      const container = document.getElementById(containerId);
      if (!container) return;
      container.innerHTML = '';

      UPLOADER_GENRES.forEach(g => {
        const isSelected = selectedArray.some(sel => sel.toLowerCase() === g.toLowerCase());
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:14px; font-size:12px; cursor:pointer; font-weight:500; transition:all 0.15s ease;' +
          (isSelected
            ? 'background:rgba(99,102,241,0.25); border:1px solid #6366f1; color:#a5b4fc;'
            : 'background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.12); color:#94a3b8;');

        const box = document.createElement('span');
        box.style.cssText = 'width:12px; height:12px; border-radius:3px; display:inline-flex; align-items:center; justify-content:center; font-size:9px; font-weight:bold; color:#fff;' +
          (isSelected ? 'background:#6366f1; border:1px solid #6366f1;' : 'border:1px solid rgba(255,255,255,0.3);');
        box.textContent = isSelected ? '✓' : '';

        const label = document.createElement('span');
        label.textContent = g;

        btn.appendChild(box);
        btn.appendChild(label);

        btn.onclick = () => {
          const idx = selectedArray.findIndex(sel => sel.toLowerCase() === g.toLowerCase());
          if (idx >= 0) selectedArray.splice(idx, 1);
          else selectedArray.push(g);
          document.getElementById(hiddenInputId).value = selectedArray.join(', ');
          renderPortalGenrePills(containerId, hiddenInputId, selectedArray);
        };

        container.appendChild(btn);
      });
    }

    setTimeout(() => {
      renderPortalGenrePills('uploadGenrePills', 'genreInput', uploadSelectedGenres);
    }, 100);

    function loadSelectedTrackInfo() {
      const select = document.getElementById('trackSelect');
      const trackId = parseInt(select.value, 10);
      const track = allManageTracks.find(t => t.id === trackId);
      if (!track) return;

      document.getElementById('editTitleInput').value = track.title || '';
      document.getElementById('editArtistInput').value = track.artist || '';
      document.getElementById('editAlbumInput').value = track.album || '';
      document.getElementById('editGenreInput').value = track.genre || '';
      document.getElementById('editYearInput').value = track.year || '';

      editSelectedGenres = (track.genre || '').split(',').map(s => s.trim()).filter(Boolean);
      renderPortalGenrePills('editGenrePills', 'editGenreInput', editSelectedGenres);

      document.getElementById('editFieldsContainer').style.display = 'block';
    }

    async function saveTrackMetadata() {
      const select = document.getElementById('trackSelect');
      const trackId = parseInt(select.value, 10);
      if (!trackId) return;

      const title = document.getElementById('editTitleInput').value;
      const artist = document.getElementById('editArtistInput').value;
      const album = document.getElementById('editAlbumInput').value;
      const genre = document.getElementById('editGenreInput').value;
      const year = document.getElementById('editYearInput').value;

      const resultAlert = document.getElementById('resultAlert');
      resultAlert.style.display = 'none';

      try {
        const res = await fetch('/api/manage-tracks/' + trackId, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, artist, album, genre, year })
        });
        const data = await res.json();
        if (res.ok) {
          resultAlert.className = 'result-alert success';
          resultAlert.innerHTML = '✅ Updated <strong>' + data.track.title + '</strong> by ' + data.track.artist + '!';
          resultAlert.style.display = 'block';
          await loadManageTracks();
        } else {
          resultAlert.className = 'result-alert error';
          resultAlert.textContent = data.error || 'Failed to update track';
          resultAlert.style.display = 'block';
        }
      } catch (e) {
        resultAlert.className = 'result-alert error';
        resultAlert.textContent = 'Failed to update track: ' + e.message;
        resultAlert.style.display = 'block';
      }
    }

    async function resetTrackMetadata() {
      const select = document.getElementById('trackSelect');
      const trackId = parseInt(select.value, 10);
      if (!trackId) return;

      const resultAlert = document.getElementById('resultAlert');
      resultAlert.style.display = 'none';

      try {
        const res = await fetch('/api/manage-tracks/' + trackId + '/reset', {
          method: 'POST'
        });
        const data = await res.json();
        if (res.ok) {
          resultAlert.className = 'result-alert success';
          resultAlert.innerHTML = '🔄 Reset metadata for <strong>' + data.track.title + '</strong>!';
          resultAlert.style.display = 'block';
          await loadManageTracks();
          loadSelectedTrackInfo();
        } else {
          resultAlert.className = 'result-alert error';
          resultAlert.textContent = data.error || 'Failed to reset track';
          resultAlert.style.display = 'block';
        }
      } catch (e) {
        resultAlert.className = 'result-alert error';
        resultAlert.textContent = 'Failed to reset track: ' + e.message;
        resultAlert.style.display = 'block';
      }
    }

    const audioInput = document.getElementById('audioFileInput');
    const audioNameBadge = document.getElementById('audioNameBadge');
    const coverArtInput = document.getElementById('coverArtInput');
    const artPreview = document.getElementById('artPreview');
    const artistImageInput = document.getElementById('artistImageInput');
    const artistImgPreview = document.getElementById('artistImgPreview');
    const artistInput = document.getElementById('artistInput');
    const existingArtistBadge = document.getElementById('existingArtistBadge');

    const standaloneArtistImgInput = document.getElementById('standaloneArtistImgInput');
    const standaloneArtistPreview = document.getElementById('standaloneArtistPreview');

    // Collaboration inputs script
    const addCollabBtn = document.getElementById('addCollabBtn');
    const collaboratorsContainer = document.getElementById('collaboratorsContainer');
    const collabModeSelect = document.getElementById('collabModeSelect');
    const collabPreviewBadge = document.getElementById('collabPreviewBadge');
    const collabPreviewText = document.getElementById('collabPreviewText');

    function updateCollabPreview() {
      const primary = artistInput.value.trim();
      const collabInputs = document.querySelectorAll('.collab-input');
      const collabs = Array.from(collabInputs).map(inp => inp.value.trim()).filter(v => v.length > 0);
      const mode = collabModeSelect.value;

      if (primary && collabs.length > 0) {
        let formatted = primary;
        if (mode === 'feat') formatted += ' feat. ' + collabs.join(' & ');
        else if (mode === 'and') formatted += ' & ' + collabs.join(' & ');
        else if (mode === 'comma') formatted += ', ' + collabs.join(', ');
        collabPreviewText.textContent = formatted;
        collabPreviewBadge.style.display = 'block';
      } else {
        collabPreviewBadge.style.display = 'none';
      }
    }

    artistInput.addEventListener('input', () => {
      const val = artistInput.value.trim().toLowerCase();
      const match = registeredArtists.find(a => a.artist.toLowerCase() === val);
      if (match && match.artist_image_path) {
        existingArtistBadge.style.display = 'block';
      } else {
        existingArtistBadge.style.display = 'none';
      }
      updateCollabPreview();
    });

    collabModeSelect.addEventListener('change', updateCollabPreview);

    addCollabBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; gap: 0.5rem; align-items: center; margin-top: 0.25rem;';

      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'collaborators[]';
      input.className = 'collab-input';
      input.setAttribute('list', 'existingArtistList');
      input.placeholder = 'Search or enter collaborator artist...';
      input.style.cssText = 'flex: 1; padding: 0.5rem 0.75rem; background: #0f172a; border: 1px solid var(--border); border-radius: 0.375rem; color: #fff; font-size: 0.85rem; outline: none;';
      input.addEventListener('input', updateCollabPreview);

      const rmBtn = document.createElement('button');
      rmBtn.type = 'button';
      rmBtn.className = 'remove-collab-btn';
      rmBtn.textContent = '✕';
      rmBtn.style.cssText = 'background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; padding: 0.4rem 0.65rem; border-radius: 0.375rem; font-size: 0.8rem; cursor: pointer;';
      rmBtn.addEventListener('click', () => {
        row.remove();
        updateCollabPreview();
      });

      row.appendChild(input);
      row.appendChild(rmBtn);
      collaboratorsContainer.appendChild(row);
      input.focus();
    });

    audioInput.addEventListener('change', () => {
      if (audioInput.files.length > 0) {
        audioNameBadge.textContent = audioInput.files[0].name;
        audioNameBadge.style.display = 'inline-block';
      }
    });

    coverArtInput.addEventListener('change', () => {
      if (coverArtInput.files.length > 0) {
        const file = coverArtInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          artPreview.src = e.target.result;
          artPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    artistImageInput.addEventListener('change', () => {
      if (artistImageInput.files.length > 0) {
        const file = artistImageInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          artistImgPreview.src = e.target.result;
          artistImgPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    standaloneArtistImgInput.addEventListener('change', () => {
      if (standaloneArtistImgInput.files.length > 0) {
        const file = standaloneArtistImgInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          standaloneArtistPreview.src = e.target.result;
          standaloneArtistPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
      }
    });

    // Form 1: Submit Song
    document.getElementById('uploadSongForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (!audioInput.files.length) return;

      const submitSongBtn = document.getElementById('submitSongBtn');
      const progressWrap = document.getElementById('progressWrap');
      const progressFill = document.getElementById('progressFill');
      const resultAlert = document.getElementById('resultAlert');

      const formData = new FormData(document.getElementById('uploadSongForm'));
      submitSongBtn.disabled = true;
      submitSongBtn.textContent = 'Uploading Song...';
      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      resultAlert.style.display = 'none';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload', true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          progressFill.style.width = percent + '%';
        }
      };

      xhr.onload = () => {
        submitSongBtn.disabled = false;
        submitSongBtn.textContent = 'Upload Song to LocalTune';
        progressWrap.style.display = 'none';

        if (xhr.status === 200) {
          const resp = JSON.parse(xhr.responseText);
          resultAlert.className = 'result-alert success';
          resultAlert.innerHTML = '🎉 <strong>' + resp.track.title + '</strong> by ' + resp.track.artist + ' uploaded successfully!';
          resultAlert.style.display = 'block';
          document.getElementById('uploadSongForm').reset();
          collaboratorsContainer.innerHTML = '';
          updateCollabPreview();
          audioNameBadge.style.display = 'none';
          artPreview.style.display = 'none';
          artistImgPreview.style.display = 'none';
          existingArtistBadge.style.display = 'none';
          loadArtists();
        } else {
          try {
            const errResp = JSON.parse(xhr.responseText);
            resultAlert.className = 'result-alert error';
            resultAlert.textContent = errResp.error || 'Upload failed';
          } catch(e) {
            resultAlert.className = 'result-alert error';
            resultAlert.textContent = 'Upload failed with status ' + xhr.status;
          }
          resultAlert.style.display = 'block';
        }
      };

      xhr.onerror = () => {
        submitSongBtn.disabled = false;
        submitSongBtn.textContent = 'Upload Song to LocalTune';
        progressWrap.style.display = 'none';
        resultAlert.className = 'result-alert error';
        resultAlert.textContent = 'Network error during upload.';
        resultAlert.style.display = 'block';
      };

      xhr.send(formData);
    });

    // Form 2: Submit Standalone Artist Profile
    document.getElementById('uploadArtistForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const submitArtistBtn = document.getElementById('submitArtistBtn');
      const resultAlert = document.getElementById('resultAlert');

      const formData = new FormData(document.getElementById('uploadArtistForm'));
      submitArtistBtn.disabled = true;
      submitArtistBtn.textContent = 'Saving Artist Profile...';
      resultAlert.style.display = 'none';

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/upload-artist', true);

      xhr.onload = () => {
        submitArtistBtn.disabled = false;
        submitArtistBtn.textContent = 'Save Artist Profile';

        if (xhr.status === 200) {
          const resp = JSON.parse(xhr.responseText);
          resultAlert.className = 'result-alert success';
          resultAlert.innerHTML = '🌟 <strong>' + resp.artist.name + '</strong> profile created/updated successfully!';
          resultAlert.style.display = 'block';
          document.getElementById('uploadArtistForm').reset();
          standaloneArtistPreview.style.display = 'none';
          loadArtists();
        } else {
          try {
            const errResp = JSON.parse(xhr.responseText);
            resultAlert.className = 'result-alert error';
            resultAlert.textContent = errResp.error || 'Failed to save artist profile';
          } catch(e) {
            resultAlert.className = 'result-alert error';
            resultAlert.textContent = 'Artist creation failed with status ' + xhr.status;
          }
          resultAlert.style.display = 'block';
        }
      };

      xhr.onerror = () => {
        submitArtistBtn.disabled = false;
        submitArtistBtn.textContent = 'Save Artist Profile';
        resultAlert.className = 'result-alert error';
        resultAlert.textContent = 'Network error saving artist profile.';
        resultAlert.style.display = 'block';
      };

      xhr.send(formData);
    });
  </script>
</body>
</html>
  `;
}

uploaderRouter.get('/uploader', (req, res) => {
  const proto = req.protocol;
  const host = req.get('host');
  const baseUrl = `${proto}://${host}`;
  res.send(generateUploaderHtml({
    uploadUrl: `${baseUrl}/upload`,
    webPlayerUrl: process.env.WEB_PLAYER_URL || 'http://localhost:5173',
    subtitle: `Upload songs & manage artist profiles — ${baseUrl}`
  }));
});

// Only start the standalone portal server when uploader.js is executed directly
// (index.js imports these handlers without spawning a second listener).
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  app.use(uploaderRouter);

  app.get('/', (req, res) => {
    res.send(generateUploaderHtml({
      uploadUrl: '/upload',
      webPlayerUrl: `http://localhost:5173`,
      subtitle: `Upload songs & manage artist profiles (Port ${UPLOAD_PORT})`
    }));
  });

  initDatabase()
    .then(() => {
      app.listen(UPLOAD_PORT, '0.0.0.0', () => {
        console.log(`🚀 LocalTune Music Uploader running on http://0.0.0.0:${UPLOAD_PORT}`);
      });
    })
    .catch((err) => {
      console.error('Fatal: database initialization failed:', err);
      process.exit(1);
    });
}

export default app;
