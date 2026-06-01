const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();

// GET /api/history
router.get('/', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;
  const filterUserId = req.query.userId ? parseInt(req.query.userId) : null;

  let rows, total;

  if (req.user.role === 'admin' && filterUserId) {
    rows = db.prepare(
      'SELECT h.*, u.email FROM history h JOIN users u ON h.user_id = u.id WHERE h.user_id = ? ORDER BY h.created_at DESC LIMIT ? OFFSET ?'
    ).all(filterUserId, limit, offset);
    total = db.prepare('SELECT COUNT(*) as n FROM history WHERE user_id = ?').get(filterUserId).n;
  } else if (req.user.role === 'admin') {
    rows = db.prepare(
      'SELECT h.*, u.email FROM history h JOIN users u ON h.user_id = u.id ORDER BY h.created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
    total = db.prepare('SELECT COUNT(*) as n FROM history').get().n;
  } else {
    rows = db.prepare(
      'SELECT h.*, u.email FROM history h JOIN users u ON h.user_id = u.id WHERE h.user_id = ? ORDER BY h.created_at DESC LIMIT ? OFFSET ?'
    ).all(req.user.id, limit, offset);
    total = db.prepare('SELECT COUNT(*) as n FROM history WHERE user_id = ?').get(req.user.id).n;
  }

  res.json({
    data: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// DELETE /api/history/:id  (admin only)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM history WHERE id = ?').run(parseInt(req.params.id));
  res.json({ message: 'Entrée supprimée' });
});

module.exports = router;
