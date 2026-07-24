# Product Requirements Document
## LocalTune — Personal Music Streaming Web App

**Owner:** Piyush
**Type:** Portfolio project
**Stack:** Node.js/Express backend, React frontend, SQLite for metadata

---

## 1. Overview

LocalTune is a self-hosted web application that scans music folders on Piyush's PC, indexes them, and streams the audio over his home network to any device with a browser — his PC, phone, tablet, or another computer on the same Wi-Fi. There is no cloud storage and no external API: the PC running the server *is* the music source. Piyush and a small set of trusted people (close friends/family) each log in with their own account, sharing the same music library while keeping their own playlists and favorites separate.

The goal is a small, well-architected, believably production-quality app for a portfolio — not a Spotify clone, but built with the same rigor (proper streaming, a real metadata pipeline, clean API boundaries) so it demonstrates real engineering judgment.

## 2. Goals

- Reliable playback with seeking (scrubbing) on files served from the local machine.
- Accessible from any device on the same LAN via a browser, no app install.
- Library auto-discovered from configured folders — no manual file-by-file entry.
- Core listening features: browse, search, queue, playlists, favorites.
- Simple per-person login so a small group of trusted people (family/friends) can each have their own playlists and favorites against one shared library.
- Clean separation between the indexing/scanning layer, the API layer, and the UI, so the codebase reads well in a portfolio review.

## 3. Non-Goals (v1)

- No public sign-up or open registration — accounts are created/invited by Piyush only, for a small trusted group.
- No internet-facing deployment or cloud storage (LAN-only, even with accounts).
- No audio transcoding (files are served in their native format).
- No lyrics, equalizer, or social features.
- No mobile native app — mobile access is via the responsive web UI.

## 4. Users

Piyush plus a small set of trusted people (close friends/family), all on his home network, from multiple devices (PC, phone, tablet). Everyone shares the same music library (the tracks index), but each person has their own account with their own playlists and favorites. No public sign-up — Piyush creates accounts for people he invites. No admin/permissions tiers beyond that; every logged-in user has the same access to the shared library.

## 5. System Architecture

```
[PC: Node/Express server] --(binds 0.0.0.0:PORT)--> [Local Network]
        |                                                  |
   [SQLite index]                                   [Browser on PC]
        |                                                  |
   [Filesystem scan]                                [Browser on phone/tablet]
```

- **Backend (Node.js + Express):** owns the filesystem, the SQLite index, and all API/streaming endpoints. Runs on the PC.
- **Frontend (React, served by the backend or via Vite in dev):** the player UI, works identically on desktop and mobile browsers via responsive design.
- **Database (SQLite):** stores the track index (metadata), user accounts, playlists, favorites, and play history. Chosen over a JSON file because the library will grow and needs querying (search, joins for playlists) without loading everything into memory.
- **Network access:** server binds to `0.0.0.0` so devices on the same LAN can reach it via `http://<pc-local-ip>:<port>`. No port forwarding or external exposure — LAN only.
- **Auth:** simple username/password login with hashed passwords and a session (cookie or JWT) so each browser stays logged in as a given user. Not designed for internet-facing use — it's there to keep playlists/favorites separate between the people using the app, not to withstand serious attack.

## 6. Data Model

**tracks**
| field | type | notes |
|---|---|---|
| id | integer PK | |
| file_path | text, unique | absolute path on disk |
| title | text | from ID3/tag, fallback to filename |
| artist | text | fallback "Unknown Artist" |
| album | text | fallback "Unknown Album" |
| duration_seconds | integer | |
| format | text | mp3, flac, wav, m4a |
| file_size | integer | |
| date_added | datetime | |
| date_modified | datetime | for detecting changed files on rescan |

**users**
| field | type | notes |
|---|---|---|
| id | integer PK | |
| username | text, unique | |
| password_hash | text | never store plaintext |
| display_name | text | |
| date_created | datetime | |

**playlists**
| field | type | notes |
|---|---|---|
| id | integer PK | |
| user_id | FK | owner of the playlist — playlists are private to their creator |
| name | text | |
| date_created | datetime | |

**playlist_tracks**
| field | type | notes |
|---|---|---|
| playlist_id | FK | |
| track_id | FK | |
| position | integer | order within playlist |

**favorites**
| field | type | notes |
|---|---|---|
| user_id | FK | |
| track_id | FK | |
| date_added | datetime | |
| | | unique on (user_id, track_id) — each user favorites tracks independently |

## 7. Functional Requirements & User Flows

### 7.1 Authentication & Accounts
- Piyush creates an account for each trusted person (no public sign-up form) with a username and password.
- Login screen: username + password → session established (cookie or JWT), persists across browser restarts on that device until explicit logout.
- All API routes except login require a valid session; the streaming endpoint also requires a valid session so the library isn't reachable by an unauthenticated device on the network.
- The track library itself is shared and identical for every logged-in user — accounts only separate playlists and favorites, not the music.

### 7.2 Library Scanning
- On server start, and on-demand via a "Rescan Library" action, the backend walks configured root folder(s) recursively.
- For each audio file found (mp3, flac, wav, m4a):
  - If `file_path` is new → parse metadata tags, insert into `tracks`.
  - If `file_path` exists but `date_modified` on disk is newer than stored → re-parse and update.
  - If a previously indexed `file_path` no longer exists on disk → remove from `tracks` (and cascade-clean playlist_tracks/favorites references).
- Corrupt or unreadable files are logged and skipped, not fatal to the scan.
- Scan progress is exposed via a status endpoint so the UI can show "Scanning… 240/1500 files."

### 7.3 Browsing
- Default view: all tracks, sortable by title/artist/album/date added.
- Album and Artist grouped views (derived from tag metadata).

### 7.4 Search
- Search bar queries title, artist, and album (SQL `LIKE`, case-insensitive) as the user types (debounced).
- Results ranked with exact-prefix matches first.

### 7.5 Playback & Queue
- Clicking a track starts playback and sets the queue to the current view's track list (or the playlist, if playing from one), starting at the clicked track.
- Standard transport: play/pause, next/previous, seek (scrub bar), volume.
- Queue is visible and reorderable; user can add/remove tracks from the queue without disrupting current playback.
- Playback state persists across navigation within the app (a persistent bottom player bar, not tied to one page).

### 7.6 Streaming
- Audio is served via a dedicated `/stream/:trackId` endpoint that supports **HTTP Range requests**, so the browser's `<audio>` element can seek without downloading the whole file first.
- Requires a valid logged-in session (see 7.1) — the endpoint checks auth before serving bytes.
- Correct `Content-Type` per format (audio/mpeg, audio/flac, audio/wav, audio/mp4).

### 7.7 Playlists
- Create, rename, delete playlists — playlists belong to the logged-in user; other users don't see or edit them.
- Add/remove tracks to/from a playlist; reorder tracks within a playlist (drag-and-drop or up/down controls).
- Play an entire playlist as the queue.

### 7.8 Favorites
- Toggle favorite on any track from any view — favorites are per-user.
- Dedicated "Favorites" view showing only the logged-in user's favorites.

### 7.9 Cross-Device Access
- Same UI and feature set on phone and desktop browsers via responsive layout — this isn't a separate mobile app, just a page that works well at any width.
- Each person logs in on their own device(s); one device actively drives playback at a time per session (playback happens in whichever browser tab has it open) — this isn't a multi-room sync system.

## 8. Non-Functional Requirements

- **Performance:** search results return in well under 300ms for a library up to ~20,000 tracks; scanning shouldn't block the API (run async/in background).
- **Reliability:** a single bad file must never crash the scan or the server.
- **Security:** LAN-only by design; passwords are hashed (e.g. bcrypt), never stored or logged in plaintext; sessions/tokens aren't exposed in URLs. Even with accounts, the README should call out that this should never be exposed to the public internet as-is — auth here is meant to separate trusted users' data, not to withstand internet-facing attacks.
- **Resilience to library changes:** files renamed, moved, or deleted between scans are reconciled correctly (see 7.1).

## 9. UI & Visual Design Direction

LocalTune should feel like a focused personal listening app, not a feature-dense enterprise dashboard — closer in spirit to a stripped-down Spotify than to a generic admin panel. Concretely:

- **Theme:** dark-mode-first. A dark background with high-contrast text reads better for a music app used in low-light, casual-listening contexts, and it's a more forgiving palette for album art and accent colors to sit on top of. (Not a hard requirement to exclude a light theme entirely, but dark is the primary, default experience.)
- **Layout:** a persistent bottom player bar (transport controls, current track, scrub bar) that stays visible across every view, with the main content area above it switching between Library, Albums, Artists, Playlists, Favorites, and Search.
- **Library/browsing views:** a card or grid layout for albums/artists (visual, scannable), and a clean row-based list for the flat track view (title/artist/album/duration columns) — the two views serve different browsing habits and shouldn't be forced into one layout.
- **Density:** minimal and uncluttered over feature-dense. v1's scope (browse, search, queue, playlists, favorites) doesn't need a busy interface — generous spacing, a clear typographic hierarchy (track title prominent, artist/album secondary), and restraint on decorative chrome.
- **Accent/identity:** one deliberate accent color (not a generic default blue) used consistently for active/playing states, the scrub bar fill, and primary actions — gives the app a distinct visual identity rather than reading as an unstyled template.
- **Login screen:** simple and consistent with the rest of the app's dark, minimal aesthetic — not a separate visual style from the main app.
- **Responsiveness:** the same visual language adapts to phone width (the player bar becomes more compact, grid columns collapse) rather than a materially different mobile design.

This direction is intentionally a starting point, not a locked spec — the agent should use it as the default design language rather than inventing its own from scratch or falling back to unstyled/default component looks.

## 10. Future Enhancements (explicitly out of v1 scope)
- Password reset flow, "forgot password" (v1 assumes Piyush resets manually if needed).
- Lyrics display, gapless playback, crossfade.
- Smart playlists (e.g., "recently added," "most played").
- Album art extraction and display.
