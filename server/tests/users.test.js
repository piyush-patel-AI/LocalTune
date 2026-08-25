import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

useTempDb('users');
const { createUser, getUserByUsername, getUserById, getAllUsersPublic, getBackendMode } = await import('../db.js');

test('backend resolves to local sqlite for tests', async () => {
  await createUser('__modecheck', 'x', 'Mode');
  assert.equal(getBackendMode(), 'local');
});

test('createUser returns a numeric id and persists the row', async () => {
  const id = await createUser('alice', 'hash-alice', 'Alice A');
  assert.equal(typeof id, 'number');
  assert.ok(id > 0);

  const user = await getUserByUsername('alice');
  assert.ok(user);
  assert.equal(user.id, id);
  assert.equal(user.username, 'alice');
  assert.equal(user.display_name, 'Alice A');
  assert.equal(user.password_hash, 'hash-alice');
});

test('getUserById roundtrip and miss behavior', async () => {
  const id = await createUser('bob', 'hash-bob', 'Bob B');
  const user = await getUserById(id);
  assert.equal(user.username, 'bob');
  assert.equal(await getUserById(999999), undefined);
});

test('duplicate usernames are rejected by UNIQUE constraint', async () => {
  await createUser('carol', 'h1', 'Carol');
  await assert.rejects(() => createUser('carol', 'h2', 'Carol Two'));
});

test('getAllUsersPublic never leaks password hashes', async () => {
  await createUser('dave', 'secret-hash', 'Dave D');
  const users = await getAllUsersPublic();
  assert.ok(users.length >= 4);
  for (const u of users) {
    assert.ok(!('password_hash' in u), 'password_hash must not be exposed publicly');
    assert.ok(u.username && u.display_name);
  }
});
