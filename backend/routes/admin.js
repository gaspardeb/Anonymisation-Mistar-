const express = require('express');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();

function audit(userId, action, details, ip) {
  db.prepare(
    'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)'
  ).run(userId, action, details, ip);
}

// GET /api/admin/users
router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, email, role, is_active, must_change_password, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// POST /api/admin/users
router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (min. 8 caractères)' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const result = db.prepare(
    "INSERT INTO users (email, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)"
  ).run(email.toLowerCase().trim(), hash, role === 'admin' ? 'admin' : 'user');

  audit(req.user.id, 'CREATE_USER', `Nouvel utilisateur : ${email}`, req.ip);
  res.status(201).json({ id: result.lastInsertRowid, email: email.toLowerCase().trim(), role: role || 'user' });
});

// PATCH /api/admin/users/:id
router.patch('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { is_active, role } = req.body;

  if (is_active !== undefined) {
    db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?")
      .run(is_active ? 1 : 0, userId);
    audit(req.user.id, 'UPDATE_USER', `User ${userId} is_active=${is_active}`, req.ip);
  }
  if (role !== undefined) {
    db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?")
      .run(role, userId);
    audit(req.user.id, 'UPDATE_USER', `User ${userId} role=${role}`, req.ip);
  }
  res.json({ message: 'Utilisateur mis à jour' });
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Mot de passe trop court (min. 8 caractères)' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare(
    "UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = datetime('now') WHERE id = ?"
  ).run(hash, userId);

  audit(req.user.id, 'RESET_PASSWORD', `User ${userId}`, req.ip);
  res.json({ message: 'Mot de passe réinitialisé' });
});

// GET /api/admin/stats
router.get('/stats', requireAuth, requireAdmin, (req, res) => {
  const totalDocs  = db.prepare('SELECT COUNT(*) as n FROM history').get().n;
  const totalUsers = db.prepare('SELECT COUNT(*) as n FROM users').get().n;

  const byUser = db.prepare(
    'SELECT u.email, COUNT(h.id) as count FROM history h JOIN users u ON h.user_id = u.id GROUP BY h.user_id ORDER BY count DESC'
  ).all();

  const byDay = db.prepare(
    "SELECT date(created_at) as day, COUNT(*) as count FROM history WHERE created_at >= date('now', '-30 days') GROUP BY day ORDER BY day"
  ).all();

  res.json({ totalDocs, totalUsers, byUser, byDay });
});

// GET /api/admin/audit-logs
router.get('/audit-logs', requireAuth, requireAdmin, (req, res) => {
  const page   = Math.max(1, parseInt(req.query.page) || 1);
  const limit  = 50;
  const offset = (page - 1) * limit;

  const logs  = db.prepare(
    'SELECT a.*, u.email FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT ? OFFSET ?'
  ).all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as n FROM audit_logs').get().n;

  res.json({ data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// GET /api/admin/config
router.get('/config', requireAuth, requireAdmin, (req, res) => {
  res.json({ hasApiKey: !!process.env.MISTRAL_API_KEY });
});

// POST /api/admin/config/api-key
router.post('/config/api-key', requireAuth, requireAdmin, (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'Clé API requise' });
  }

  const envPath = path.join(__dirname, '../../backend/.env');

  try {
    let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (content.match(/^MISTRAL_API_KEY=/m)) {
      content = content.replace(/^MISTRAL_API_KEY=.*/m, `MISTRAL_API_KEY=${apiKey.trim()}`);
    } else {
      content = content.trimEnd() + `\nMISTRAL_API_KEY=${apiKey.trim()}\n`;
    }
    fs.writeFileSync(envPath, content);
    process.env.MISTRAL_API_KEY = apiKey.trim();

    audit(req.user.id, 'UPDATE_API_KEY', 'Clé API Mistral mise à jour', req.ip);
    res.json({ message: 'Clé API mise à jour' });
  } catch (err) {
    console.error('Erreur écriture .env :', err);
    res.status(500).json({ error: 'Impossible de sauvegarder la clé API' });
  }
});

module.exports = router;
