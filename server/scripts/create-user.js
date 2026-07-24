import bcrypt from 'bcryptjs';
import { createUser, getUserByUsername } from '../db.js';

const args = process.argv.slice(2);
const username = args[0];
const password = args[1];
const displayName = args[2] || username;

if (!username || !password) {
  console.log('Usage: node scripts/create-user.js <username> <password> [displayName]');
  process.exit(1);
}

try {
  const existing = getUserByUsername(username);
  if (existing) {
    console.error(`❌ User '${username}' already exists!`);
    process.exit(1);
  }

  const saltRounds = 10;
  const passwordHash = bcrypt.hashSync(password, saltRounds);
  const userId = createUser(username, passwordHash, displayName);

  console.log(`✅ User '${username}' (${displayName}) created successfully with ID: ${userId}`);
  process.exit(0);
} catch (err) {
  console.error('❌ Failed to create user:', err.message);
  process.exit(1);
}
