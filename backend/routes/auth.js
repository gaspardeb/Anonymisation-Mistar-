const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function audit(userId, action, details, ip) {
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
  ).run(userId, action, details, ip);
}

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (min. 8 caractères)' });
  }

  const normalized = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalized);
  if (existing) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(
    "INSERT INTO users (email, password_hash, role) VALUES (?, ?, 'user')"
  ).run(normalized, hash);

  audit(result.lastInsertRowid, 'CREATE_ACCOUNT', `Inscription : ${normalized}`, req.ip);

  res.status(201).json({ message: 'Compte créé avec succès' });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }

  const user = db.prepare(
    'SELECT * FROM users WHERE email = ? AND is_active = 1'
  ).get(email.toLowerCase().trim());

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    if (user) audit(user.id, 'LOGIN_FAILED', 'Mot de passe incorrect', req.ip);
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '8h' });

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000
  });

  audit(user.id, 'LOGIN', 'Connexion réussie', req.ip);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      mustChangePassword: user.must_change_password === 1
    }
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  audit(req.user.id, 'LOGOUT', '', req.ip);
  res.clearCookie('token');
  res.json({ message: 'Déconnecté' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      mustChangePassword: req.user.must_change_password === 1
    }
  });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Nouveau mot de passe trop court (min. 8 caractères)' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!user.must_change_password) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Mot de passe actuel requis' });
    }
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
  }

  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?"
  ).run(newHash, req.user.id);

  audit(req.user.id, 'PASSWORD_CHANGED', '', req.ip);
  res.json({ message: 'Mot de passe modifié avec succès' });
});

module.exports = router;
