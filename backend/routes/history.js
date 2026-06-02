const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const page    = Math.max(1, parseInt(req.query.page)  || 1);
  const limit   = Math.min(100, parseInt(req.query.limit) || 20);
  const offset  = (page - 1) * limit;
  const userId  = req.query.userId ? parseInt(req.query.userId) : null;
  const search  = req.query.search ? `%${req.query.search}%` : null;

  const isAdmin = req.user.role === 'admin';

  // Build WHERE clause
  const conditions = [];
  const params     = [];

  if (!isAdmin) {
    conditions.push('h.user_id = ?');
    params.push(req.user.id);
  } else if (userId) {
    conditions.push('h.user_id = ?');
    params.push(userId);
  }

  if (search) {
    conditions.push("h.filename LIKE ?");
    params.push(search);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows  = db.prepare(
    `SELECT h.*, u.email FROM history h JOIN users u ON h.user_id = u.id ${where} ORDER BY h.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  const total = db.prepare(
    `SELECT COUNT(*) as n FROM history h ${where}`
  ).get(...params).n;

  res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM history WHERE id = ?').run(parseInt(req.params.id));
  res.json({ message: 'Entrée supprimée' });
});

module.exports = router;
