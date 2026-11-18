// /api/auth — register, login, logout, current user
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const { validate } = require('../validation');
const { createSession, destroySession } = require('../middleware/auth');
const { conflict, unauthorized } = require('../utils/errors');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// Slow down password guessing: 10 failed attempts per 15 minutes per IP (disabled in tests).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // only failed attempts count towards the limit
  skip: () => config.env === 'test',
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

const publicUser = (u) => ({ id: u.id, fullName: u.full_name, email: u.email, role: u.role });

router.post('/register', async (req, res) => {
  const data = validate('register', req.body);

  const existing = await db.query(
    'SELECT email, student_number FROM users WHERE email = ? OR (student_number IS NOT NULL AND student_number = ?)',
    [data.email, data.studentNumber]);
  if (existing.some((u) => u.email === data.email)) {
    throw conflict('An account with this email already exists. Log in instead, or use a different email.');
  }
  if (existing.length) throw conflict('This student number is already registered to another account.');

  const hash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const result = await db.query(
    `INSERT INTO users (full_name, email, student_number, phone, password_hash, role)
     VALUES (?, ?, ?, ?, ?, 'student')`,
    [data.fullName, data.email, data.studentNumber, data.phone, hash]);

  await createSession(res, result.insertId);
  res.status(201).json({
    message: 'Account created. You are now logged in.',
    user: { id: result.insertId, fullName: data.fullName, email: data.email, role: 'student' },
  });
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = validate('login', req.body);
  const [user] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  // Same message whether the email or password is wrong, so accounts cannot be enumerated.
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) throw unauthorized('Incorrect email or password. Check both and try again.');

  await createSession(res, user.id);
  res.json({ message: `Welcome back, ${user.full_name.split(' ')[0]}.`, user: publicUser(user) });
});

router.post('/logout', async (req, res) => {
  await destroySession(req, res);
  res.json({ message: 'You have been logged out.' });
});

// Returns the current user, or null when logged out (200 either way, so the client can check quietly).
router.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

module.exports = router;
