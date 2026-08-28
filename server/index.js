import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import connectPgSimple from 'connect-pg-simple';

import authRoutes from './routes/auth.js';
import scanRoutes from './routes/scan.js';
import tracksRoutes from './routes/tracks.js';
import playlistsRoutes from './routes/playlists.js';
import favoritesRoutes from './routes/favorites.js';
import streamRoutes from './routes/stream.js';
import statsRoutes from './routes/stats.js';
import { getTrackById, initDatabase, getPool } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { uploadFieldsMiddleware, handleUploadTrack, uploaderRouter } from './uploader.js';
import { serveStoredImage } from './mediaServe.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Sync Assets/logo.png to client/public
try {
  const assetLogo = path.join(__dirname, '../Assets/logo.png');
  const publicDir = path.join(__dirname, '../client/public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  if (fs.existsSync(assetLogo)) {
    fs.copyFileSync(assetLogo, path.join(publicDir, 'logo.png'));
    fs.copyFileSync(assetLogo, path.join(publicDir, 'favicon.png'));
    console.log('[LocalTune Server] Synced logo.png & favicon.png to client/public');
  }
} catch (e) {
  console.warn('[LocalTune Server] Could not sync logo asset:', e.message);
}

// CORS setup
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Trust Render's reverse proxy so req.secure / cookies work behind TLS
app.set('trust proxy', 1);

const isProduction = process.env.NODE_ENV === 'production';

// Session middleware with PostgreSQL-backed store.
// Shares the single application pool so total connections stay within
// the Supabase/Render session-mode limit (pool_size: 15).
const PgSession = connectPgSimple(session);
const sharedPool = getPool();

app.use(session({
  store: new PgSession({
    pool: sharedPool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'localtune_super_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Public Auth routes, Logo & Health check
app.use('/api', authRoutes);

app.get('/api/logo', (req, res) => {
  const logoPath = path.join(__dirname, '../Assets/logo.png');
  if (fs.existsSync(logoPath)) {
    res.sendFile(logoPath);
  } else {
    res.status(404).send('Logo not found');
  }
});

// Public Track Artwork Endpoint for Native Mobile Apps & System Widgets
app.get('/api/tracks/:id/art', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const trackId = parseInt(req.params.id, 10);
  const logoPath = path.join(__dirname, '../Assets/logo.png');

  if (isNaN(trackId)) {
    return fs.existsSync(logoPath) ? res.sendFile(logoPath) : res.status(400).send('Invalid ID');
  }

  try {
    const track = await getTrackById(trackId);
    if (track && (track.artwork_b2_key || track.cover_art_path)) {
      return await serveStoredImage(res, track.artwork_b2_key || track.cover_art_path, logoPath);
    }
  } catch (e) {
    console.error('Error serving artwork:', e);
  }

  if (fs.existsSync(logoPath)) {
    return res.sendFile(logoPath);
  }
  return res.status(404).send('Artwork not found');
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LocalTune server is running' });
});

let currentPlaybackState = {
  title: "LocalTune",
  artist: "Streaming Music",
  album: "LocalTune",
  artUrl: "/api/logo",
  isPlaying: false,
  position: 0,
  duration: 0,
  updatedAt: Date.now()
};

app.get('/api/playback-state', (req, res) => {
  res.json(currentPlaybackState);
});

app.post('/api/playback-state', (req, res) => {
  const { title, artist, album, artUrl, isPlaying, position, duration } = req.body || {};
  currentPlaybackState = {
    title: title || currentPlaybackState.title,
    artist: artist || currentPlaybackState.artist,
    album: album || currentPlaybackState.album,
    artUrl: artUrl || currentPlaybackState.artUrl,
    isPlaying: typeof isPlaying === 'boolean' ? isPlaying : currentPlaybackState.isPlaying,
    position: typeof position === 'number' ? position : currentPlaybackState.position,
    duration: typeof duration === 'number' ? duration : currentPlaybackState.duration,
    updatedAt: Date.now()
  };
  res.json({ success: true, state: currentPlaybackState });
});

// Protected API routes
app.use('/api/scan', requireAuth, scanRoutes);
app.use('/api/tracks', requireAuth, tracksRoutes);
app.use('/api/playlists', requireAuth, playlistsRoutes);
app.use('/api/favorites', requireAuth, favoritesRoutes);
app.use('/api/stats', requireAuth, statsRoutes);
app.post('/api/upload', requireAuth, uploadFieldsMiddleware, handleUploadTrack);

// Audio Streaming route
app.use('/stream', streamRoutes);

// Uploader portal (serves HTML at /uploader and handles /upload, /upload-artist, etc.)
app.use(uploaderRouter);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Server Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// Initialize database (connection, schema, migrations) before accepting traffic
initDatabase()
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[LocalTune Server] Running on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[LocalTune Server] Fatal: database initialization failed:', err);
    process.exit(1);
  });
