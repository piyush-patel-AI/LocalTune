import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { parseAudioFile, scanLibrary } from './scanner.js';
import { upsertTrack, upsertArtistImage, getArtists, findTrackByTitleAndArtist } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const UPLOAD_PORT = process.env.UPLOAD_PORT || 5050;
const MUSIC_DIR = process.env.MUSIC_DIR || path.join(__dirname, 'music');
const ARTWORKS_DIR = path.join(MUSIC_DIR, 'artworks');
const ARTISTS_DIR = path.join(MUSIC_DIR, 'artists');

// Ensure directories exist
if (!fs.existsSync(MUSIC_DIR)) {
  fs.mkdirSync(MUSIC_DIR, { recursive: true });
}
if (!fs.existsSync(ARTWORKS_DIR)) {
  fs.mkdirSync(ARTWORKS_DIR, { recursive: true });
}
if (!fs.existsSync(ARTISTS_DIR)) {
  fs.mkdirSync(ARTISTS_DIR, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'coverArt') {
      cb(null, ARTWORKS_DIR);
    } else if (file.fieldname === 'artistImage') {
      cb(null, ARTISTS_DIR);
    } else {
      cb(null, MUSIC_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e4);
    cb(null, `${cleanName}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max per file
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded artworks if requested
app.use('/artworks', express.static(ARTWORKS_DIR));
app.use('/artists', express.static(ARTISTS_DIR));

// GET /api/artists - List all registered artists for autocomplete
app.get('/api/artists', (req, res) => {
  try {
    const artists = getArtists();
    res.json({ artists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /upload-artist - Create/Update Artist Profile without uploading a song
app.post('/upload-artist', upload.single('artistImage'), async (req, res) => {
  try {
    const artistName = req.body.artistName ? req.body.artistName.trim() : '';
    if (!artistName) {
      return res.status(400).json({ error: 'Artist Name is required' });
    }

    const artistImgFile = req.file;
    if (!artistImgFile) {
      return res.status(400).json({ error: 'Artist profile image is required' });
    }

    const artistImgPath = artistImgFile.path;
    upsertArtistImage(artistName, artistImgPath);

    return res.json({
      success: true,
      message: `Artist profile for "${artistName}" saved successfully!`,
      artist: {
        name: artistName,
        imagePath: artistImgPath
      }
    });

  } catch (err) {
    console.error('Upload artist error:', err);
    return res.status(500).json({ error: 'Failed to save artist profile: ' + err.message });
  }
});

// POST /upload - Upload song with metadata & optional artwork
app.post('/upload', upload.fields([
  { name: 'audioFile', maxCount: 1 },
  { name: 'coverArt', maxCount: 1 },
  { name: 'artistImage', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.audioFile || req.files.audioFile.length === 0) {
      return res.status(400).json({ error: 'Audio file is required' });
    }

    const audioFile = req.files.audioFile[0];
    const coverArtFile = req.files.coverArt ? req.files.coverArt[0] : null;
    const artistImgFile = req.files.artistImage ? req.files.artistImage[0] : null;

    const audioPath = audioFile.path;
    const coverArtPath = coverArtFile ? coverArtFile.path : null;
    const artistImgPath = artistImgFile ? artistImgFile.path : null;

    // Parse audio metadata from file
    const fileStats = fs.statSync(audioPath);
    const parsed = await parseAudioFile(audioPath);

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
    const ext = path.extname(audioPath).replace('.', '').toLowerCase();

    // Safety check: Prevent duplicate upload of the same song
    const existingDuplicate = findTrackByTitleAndArtist(finalTitle, finalArtist);
    if (existingDuplicate && req.body.allowDuplicate !== 'true') {
      try {
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        if (coverArtPath && fs.existsSync(coverArtPath)) fs.unlinkSync(coverArtPath);
      } catch (e) {
        console.error('Error cleaning up duplicate temp file:', e);
      }
      return res.status(409).json({
        error: `⚠️ "${finalTitle}" by ${finalArtist} is already in your LocalTune library! Upload blocked to prevent duplicates.`
      });
    }

    const trackId = upsertTrack({
      filePath: audioPath,
      title: finalTitle,
      artist: finalArtist,
      album: finalAlbum,
      durationSeconds: parsed.durationSeconds || 0,
      format: ext,
      fileSize: fileStats.size,
      dateModified: new Date(fileStats.mtime).toISOString(),
      coverArtPath: coverArtPath
    });

    // Save primary artist image if provided
    const primaryArtist = req.body.artist ? req.body.artist.trim() : parsed.artist;
    if (primaryArtist && artistImgPath) {
      upsertArtistImage(primaryArtist, artistImgPath);
    }

    // Trigger background reconciliation scan
    scanLibrary(MUSIC_DIR).catch(err => console.error('Post-upload scan error:', err));

    return res.json({
      success: true,
      message: 'Song uploaded and indexed successfully!',
      track: {
        id: trackId,
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        format: ext,
        coverArtPath: coverArtPath,
        artistImagePath: artistImgPath
      }
    });

  } catch (err) {
    console.error('Upload endpoint error:', err);
    return res.status(500).json({ error: 'Failed to upload song: ' + err.message });
  }
});

// Single Page Upload Interface
app.get('/', (req, res) => {
  res.send(`
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
      <p class="subtitle">Upload songs & manage artist profiles (Port ${UPLOAD_PORT})</p>
    </div>

    <!-- Mode Selector Tabs -->
    <div class="tab-bar">
      <button class="tab-btn active" id="tabSongBtn" onclick="switchTab('song')">🎵 Upload Song</button>
      <button class="tab-btn" id="tabArtistBtn" onclick="switchTab('artist')">🎤 Add Artist Profile</button>
    </div>

    <!-- Autocomplete Datalists -->
    <datalist id="existingArtistList"></datalist>

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
          <label>Album Name</label>
          <input type="text" id="albumInput" name="album" placeholder="e.g. Parachutes">
        </div>
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

    <div class="progress-bar-wrap" id="progressWrap">
      <div class="progress-bar-fill" id="progressFill"></div>
    </div>

    <div id="resultAlert" class="result-alert"></div>

    <a href="http://${req.hostname}:5173" target="_blank" class="nav-link">
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

    // Tab switcher
    function switchTab(mode) {
      document.getElementById('resultAlert').style.display = 'none';
      if (mode === 'song') {
        document.getElementById('tabSongBtn').className = 'tab-btn active';
        document.getElementById('tabArtistBtn').className = 'tab-btn';
        document.getElementById('uploadSongForm').style.display = 'block';
        document.getElementById('uploadArtistForm').style.display = 'none';
      } else {
        document.getElementById('tabSongBtn').className = 'tab-btn';
        document.getElementById('tabArtistBtn').className = 'tab-btn active';
        document.getElementById('uploadSongForm').style.display = 'none';
        document.getElementById('uploadArtistForm').style.display = 'block';
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
  `);
});

app.listen(UPLOAD_PORT, '0.0.0.0', () => {
  console.log(`🚀 LocalTune Music Uploader running on http://0.0.0.0:${UPLOAD_PORT}`);
});

export default app;
