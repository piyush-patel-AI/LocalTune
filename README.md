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

## Setup & Running

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
