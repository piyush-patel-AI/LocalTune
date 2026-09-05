import { getPool } from '../db.js';

/**
 * requireAuth middleware
 *
 * Primary path:  express-session cookie (connect.sid)  →  req.session.userId
 * Fallback path: Authorization: Bearer <sessionId> header for WebView environments
 *                where cross-site cookies are blocked. The session ID is verified
 *                against the PostgreSQL session store — not trusted blindly.
 */
export const requireAuth = async (req, res, next) => {
  // ── Primary: cookie-based session ─────────────────────────────────────────
  if (req.session && req.session.userId) {
    return next();
  }

  // ── Fallback: Authorization: Bearer <sessionId> ────────────────────────────
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const sessionId = authHeader.slice(7).trim();
    if (sessionId) {
      try {
        const pool = getPool();
        // connect-pg-simple stores sessions with sess_id = 's:' + sessionId (signed).
        // The raw session ID in req.sessionID is the unsigned form.
        // We query by the raw sid column which connect-pg-simple sets to req.sessionID.
        const result = await pool.query(
          'SELECT sess FROM user_sessions WHERE sid = $1 AND expire > NOW()',
          [sessionId]
        );
        if (result.rows.length > 0) {
          const sessionData = result.rows[0].sess;
          if (sessionData && sessionData.userId) {
            // Attach session data to req so downstream route handlers work
            req.session.userId = sessionData.userId;
            req.session.username = sessionData.username;
            return next();
          }
        }
      } catch (err) {
        console.error('[requireAuth] Bearer session lookup failed:', err.message);
      }
    }
  }

  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
};
