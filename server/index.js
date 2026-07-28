import express from 'express';
import cors from 'cors';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import scanRoutes from './routes/scan.js';
import tracksRoutes from './routes/tracks.js';
import playlistsRoutes from './routes/playlists.js';
import favoritesRoutes from './routes/favorites.js';
import streamRoutes from './routes/stream.js';
import statsRoutes from './routes/stats.js';
import { requireAuth } from './middleware/auth.js';
import { uploadFieldsMiddleware, handleUploadTrack } from './uploader.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Sync Assets/logo.png to client/public
try {
  const assetLogo = path.join(__dirname, '../Assets/logo.png');
  const publicDir = path.join(__dirname, '../client/public');
  if (fs.existsSync(assetLogo)) {
    if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
    fs.copyFileSync(assetLogo, path.join(publicDir, 'logo.png'));
    fs.copyFileSync(assetLogo, path.join(publicDir, 'favicon.png'));
    console.log('[LocalTune Server] Synced logo.png & favicon.png to client/public');
  }
} catch (err) {
  console.error('[Logo Sync Error]', err);
}

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'localtune_dev_secret_key_change_in_prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // LAN HTTP access
    sameSite: 'lax',
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LocalTune server is running' });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[LocalTune Server] Running on http://0.0.0.0:${PORT}`);
});
