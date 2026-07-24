import express from 'express';
import bcrypt from 'bcryptjs';
import { getUserByUsername, getUserById } from '../db.js';

const router = express.Router();

// POST /api/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const user = getUserByUsername(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const match = bcrypt.compareSync(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  // Set session
  req.session.userId = user.id;
  req.session.username = user.username;

  return res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name
    }
  });
});

// POST /api/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully' });
  });
});

// GET /api/me (check auth state cleanly without 401 console errors)
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ user: null });
  }
  const user = getUserById(req.session.userId);
  if (!user) {
    return res.json({ user: null });
  }
  return res.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name
    }
  });
});

export default router;
