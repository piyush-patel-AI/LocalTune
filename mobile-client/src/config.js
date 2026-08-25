/**
 * API Configuration
 *
 * In development the Vite dev-server proxy (vite.config.js) forwards /api and
 * /stream requests to localhost:5000, so API_BASE stays empty.
 *
 * In production VITE_API_BASE_URL is set via the hosting platform's environment
 * variables (e.g. Vercel). Do NOT hardcode a backend URL here.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export default API_BASE;
