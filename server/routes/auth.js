import express from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getUserByUsername, getUserById, createUser, updateUserAvatar, getAllUsersPublic } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Avatar storage configuration
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../music/avatars');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const userId = req.session ? req.session.userId : 'guest';
    cb(null, `avatar_${userId}_${Date.now()}${ext}`);
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const formatUserObj = (u) => {
  if (!u) return null;
  const displayName = u.display_name || u.displayName || u.username;
  const hasAvatar = !!u.avatar_path;
  return {
    id: u.id,
    username: u.username,
    displayName: displayName,
    avatarUrl: hasAvatar ? `/api/users/${u.id}/avatar` : null
  };
};

// GET /api/users/public (public user list for Login screen)
router.get('/users/public', (req, res) => {
  try {
    const users = getAllUsersPublic();
    res.json({
      users: users.map(formatUserObj)
    });
  } catch (err) {
    console.error('Error fetching public users:', err);
    res.status(500).json({ error: 'Failed to fetch user list' });
  }
});

// GET /api/users/:id/avatar (Serve avatar image)
router.get('/users/:id/avatar', (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (!userId) return res.status(404).send('Invalid user ID');

  const user = getUserById(userId);
  if (!user || !user.avatar_path || !fs.existsSync(user.avatar_path)) {
    return res.status(404).send('Avatar not found');
  }

  res.sendFile(path.resolve(user.avatar_path));
});

// POST /api/users/avatar (Upload user PFP)
router.post('/users/avatar', uploadAvatar.single('avatar'), (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No avatar image file provided' });
  }

  try {
    const updatedUser = updateUserAvatar(req.session.userId, req.file.path);
    return res.json({
      success: true,
      user: formatUserObj(updatedUser)
    });
  } catch (err) {
    console.error('Error updating user avatar:', err);
    return res.status(500).json({ error: 'Failed to update avatar' });
  }
});

// POST /api/register
router.post('/register', (req, res) => {
  const { username, password, displayName } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const trimmedUsername = username.trim();
  if (trimmedUsername.length < 2) {
    return res.status(400).json({ error: 'Username must be at least 2 characters.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters.' });
  }

  const existingUser = getUserByUsername(trimmedUsername);
  if (existingUser) {
    return res.status(400).json({ error: 'Username is already taken.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const userDisplayName = displayName && displayName.trim() ? displayName.trim() : trimmedUsername;
  const newUserId = createUser(trimmedUsername, passwordHash, userDisplayName);

  req.session.userId = newUserId;
  req.session.username = trimmedUsername;

  const newUser = getUserById(newUserId);
  return res.status(201).json({
    user: formatUserObj(newUser)
  });
});

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
    user: formatUserObj(user)
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
    user: formatUserObj(user)
  });
});

export default router;
