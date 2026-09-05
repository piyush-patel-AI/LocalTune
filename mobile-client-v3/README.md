# LocalTune Mobile V3

Production-grade, recommendation-first mobile client for LocalTune music streaming server.

## Features
- **Speed Dial**: Swipeable 3x3 track grid with 5 discovery / 2 familiar / 2 recent candidates target composition, artist diversity rules, and deterministic refresh sliding.
- **Quick Picks**: Dedicated recommendation-driven track list distinct from Speed Dial.
- **YouTube Music Aesthetic**: Dark sonic aesthetic (`#030303`), ambient top gradient mesh, floating mini player, and hydro gloss liquid glass expanded player.
- **Real Backend Integration**: Uses existing LocalTune server & V2 recommendation engine endpoints (`/api/tracks`, `/api/tracks/recommendations`, `/api/playlists`, `/api/favorites`, etc.).

## Environment Variables
- `VITE_API_URL`: Optional custom backend base URL (defaults to window location or relative `/api` proxy).

## Development
```bash
npm install
npm run dev
```

## Vercel Deployment
To deploy this V3 frontend to Vercel:
1. Set Project Root Directory in Vercel project settings to `mobile-client-v3`.
2. Build command: `npm run build`.
3. Output directory: `dist`.
