/**
 * API Configuration
 *
 * In development the Vite dev-server proxy (vite.config.js) forwards /api and
 * /stream requests to localhost:5000.
 *
 * In production the Vercel rewrites (vercel.json) proxy /api and /stream to the
 * backend. Using a relative path (empty base) keeps cookies first-party so that
 * mobile Chrome does not block them as third-party cookies.
 */
export function apiUrl(path) {
  return path;
}
