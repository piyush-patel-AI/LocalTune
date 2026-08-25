# 🎵 LocalTune — Personal LAN-Only Music Streaming Web App

> ⚠️ **SECURITY & NETWORK WARNING**  
> **LAN-ONLY NOTICE:** LocalTune is designed strictly for local area network (LAN) self-hosting. It binds to `0.0.0.0` so devices on your home Wi-Fi can stream music from your PC. **DO NOT expose this application directly to the public internet** (e.g., via port forwarding or public VPS without proper reverse proxy authentication/VPN), as auth sessions are designed for trusted LAN users rather than internet-facing defense.

---

## Overview

LocalTune is a lightweight, self-hosted web application that recursively scans configured music folders on your PC, indexes tracks into a local SQLite database, and streams audio to any device with a web browser (PC, phone, tablet) on the same home network.

### Key Features

- **🎯 Contextual Music Recommendation Engine:** Intelligent recommendation algorithm that dynamically scores and suggests 20+ tracks tailored specifically to your active artist & album listening history, recently played tracks, and favorites.
- **🍱 Bento Box Modern Dashboard:** High-density dashboard featuring a Featured Spotlight Hero, library statistics, and personalized track discovery grid.
- **📀 Smart Release Classification (Albums, EPs & Singles):** Automatic distinction between full Albums, EPs (Extended Plays), and Singles with instant category filters.
- **🎨 Glassmorphic Playlist Manager:** Dynamic 2x2 composite album artwork mosaic generation, automatic playlist duration calculation, track reordering, and format badges (e.g. `FLAC`, `MP3`).
- **🔀 Smart Queue Shuffle & Smooth Drag Scrubbing:** Shuffle your active playback queue effortlessly without disturbing your recommended tracks list, accompanied by smooth, real-time timeline scrubbing.
- **🔒 Shared Library, Private State:** Everyone on the LAN accesses the same indexed music library, while playlists and favorites remain completely private per user account.
- **⚡ True Seeking (HTTP Range):** Dedicated streaming endpoint supporting `HTTP 206 Partial Content` (Range requests) for instant seeking without latency.

---

## ☁️ Cloud Deployment: Vercel + Render + Backblaze B2

LocalTune can run entirely in the cloud. Render hosts the Node/Express API, auth, SQLite metadata and business logic; **Backblaze B2 stores all music/artwork bytes**, so Render never streams large audio files itself.

### Architecture
| Concern | Where it runs |
|---|---|
| React frontend | **Vercel** (`client/vercel.json` proxies `/api/*` and `/stream/*` to the backend) |
| Express API, auth, SQLite, scanner, uploader | **Render** (Web Service) |
| Audio, artwork, artist images, avatars | **Backblaze B2** object storage |

- `tracks.file_path` stores a **B2 object key** like `music/Artist/Album/song.mp3`.
- `GET /stream/:trackId` looks up the key in SQLite, authorizes the session, then **302-redirects to a time-limited presigned URL**. B2 handles HTTP Range / 206 seeking natively — the web player and Android WebView follow the redirect transparently.
- Artwork / artist images / avatars are served via `302` redirects to B2 (presigned, or your CDN if `B2_PUBLIC_URL` is set).
- Duplicate-cleanup and reconciliation delete B2 objects instead of using `fs.unlinkSync()`.
- The scanner reconciles SQLite against the bucket contents and uploads embedded cover art to `artworks/<trackId>.<ext>`.

### 1. Create the B2 bucket
1. Sign up at [backblaze.com](https://www.backblaze.com/b2) → **Buckets → Create Bucket** (e.g. `localtune-media`, private).
2. Note the **Endpoint** shown in *Bucket Details* (e.g. `https://s3.us-west-004.backblazeb2.com`).
3. **Application Keys → Add Application Key** → copy the `keyID` and `applicationKey`.

### 2. Deploy the backend on Render
1. New → Web Service → point at this repo, root directory `server/`, build `npm install`, start `npm start`.
2. Set environment variables (see `server/.env.example`): `B2_ACCOUNT_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_ENDPOINT`, `SESSION_SECRET`, and `NODE_ENV=production`.
3. **Attach a Persistent Disk** (e.g. mount path `/var/data`) and set `DB_PATH=/var/data/localtune.db`, otherwise SQLite metadata is lost on every deploy.
4. Seed your user from the Render Shell: `node scripts/create-user.js piyush "password" "Piyush Patel"`.

### 3. Deploy the frontend on Vercel
1. Import the repo on Vercel with root directory `client/`.
2. Edit `client/vercel.json` and replace `https://YOUR-BACKEND.onrender.com` with your Render service URL. These rewrites keep every relative client URL (`/api/...`, `/stream/:id`) working unchanged — including the Android WebView build.

### 4. Get music into B2
- **Upload portal:** run the standalone uploader (`npm run uploader`) locally — audio/artwork go straight to B2 under `music/Artist/Album/…`, `artworks/<trackId>.<ext>` and `artists/<name>.<ext>`. Or `POST /api/upload` on the deployed API.
- **Local library ingestion:** with B2 env vars configured on your dev machine, `POST /api/scan` walks your local `MUSIC_DIR`, uploads new files to B2, then reconciles the DB against the bucket.

---

## Setup & Running (Local Development)

### 1. Prerequisites
- Node.js (v18 or higher)
- NPM

### 2. Installation
Install all dependencies for root, server, and client:
```bash
npm run install:all
```

### 3. Environment Setup
Create a `.env` file inside the `server/` directory:
```env
PORT=5000
SESSION_SECRET=super_secret_localtune_key_change_me
MUSIC_DIR=/path/to/your/music
```

### 4. Seed Initial User Account
Create your initial user account using the admin seed CLI script:
```bash
cd server
node scripts/create-user.js piyush "YourSecurePassword" "Piyush Patel"
```

### 5. Running in Development Mode
To start the Express backend server (`http://localhost:5000`), the Standalone Uploader (`http://localhost:5050`), and the Vite React frontend client (`http://localhost:5173`) concurrently:
```bash
npm run dev
```

---

## 📤 Standalone Music Uploader (Port 5050)

LocalTune includes a dedicated web uploader running on port **5050**:
- **URL:** `http://<YOUR_LOCAL_IP>:5050`
- **Features:**
  - Drag & drop audio files (`.mp3`, `.flac`, `.wav`, `.m4a`).
  - Drag & drop custom album artwork (`.jpg`, `.png`, `.webp`) with live thumbnail preview.
  - Optional song title, artist, and album override fields.
  - Automatic indexing into the music library upon upload completion.

---

## Finding Your PC's Local IP & Connecting from Other Devices

To stream music from a phone, tablet, or secondary PC on your local Wi-Fi:

1. **Find your local IP address:**
   - **Linux:** Run `hostname -I` or `ip addr show` (e.g., `192.168.1.105`)
   - **macOS:** Run `ipconfig getifaddr en0`
   - **Windows:** Run `ipconfig` in Command Prompt and check `IPv4 Address`
2. **Access from phone/tablet browser:**
   - **Music Player:** `http://<YOUR_LOCAL_IP>:5173`
   - **Song Uploader:** `http://<YOUR_LOCAL_IP>:5050`
3. **Inviting Family & Friends:**
   Create an account for each trusted person using the CLI script:
   ```bash
   cd server
   node scripts/create-user.js friend_username "Password123" "Friend Name"
   ```
   They can log in with their assigned username and password on their own device.

---

## Technology Stack

- **Backend:** Node.js, Express, SQLite (`better-sqlite3`), `music-metadata`, `bcryptjs`, `express-session`
- **Frontend:** React, Vite, Vanilla CSS design tokens (Dark mode Bento Box theme)
