/**
 * API Configuration
 *
 * In development the Vite dev-server proxy (vite.config.js) forwards /api and
 * /stream requests to localhost:5000, so API_BASE stays empty.
 *
 * In production set VITE_API_BASE_URL to the Render backend origin, e.g.
 *   VITE_API_BASE_URL=https://localtune-2.onrender.com
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export default API_BASE;
