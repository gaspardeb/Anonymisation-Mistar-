const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/database');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const uid     = req.user.id;

  const q = (sql, params = []) =>
    isAdmin ? db.prepare(sql.replace('AND user_id = ?', '')).all(...params.filter((_, i) => i > 0))
            : db.prepare(sql).all(uid, ...params.filter((_, i) => i > 0));

  const qGet = (sql, params = []) =>
    isAdmin ? db.prepare(sql.replace('AND user_id = ?', '')).get(...params.filter((_, i) => i > 0))
            : db.prepare(sql).get(uid, ...params.filter((_, i) => i > 0));

  const totalDocs     = qGet("SELECT COUNT(*) as n FROM history WHERE user_id = ? OR 1=1").n;
  const docsThisMonth = qGet("SELECT COUNT(*) as n FROM history WHERE (user_id = ? OR 1=1) AND created_at >= date('now','start of month')").n;

  // Entity stats
  const rows = isAdmin
    ? db.prepare("SELECT entity_count, entity_types FROM history").all()
    : db.prepare("SELECT entity_count, entity_types FROM history WHERE user_id = ?").all(uid);

  let totalEntities = 0;
  const entitiesByType = {};
  for (const row of rows) {
    totalEntities += (row.entity_count || 0);
    try {
      const types = JSON.parse(row.entity_types || '{}');
      for (const [k, v] of Object.entries(types)) {
        entitiesByType[k] = (entitiesByType[k] || 0) + v;
      }
    } catch {}
  }

  // Last 30 days
  const byDay = isAdmin
    ? db.prepare("SELECT date(created_at) as day, COUNT(*) as count FROM history WHERE created_at >= date('now','-30 days') GROUP BY day ORDER BY day").all()
    : db.prepare("SELECT date(created_at) as day, COUNT(*) as count FROM history WHERE user_id = ? AND created_at >= date('now','-30 days') GROUP BY day ORDER BY day").all(uid);

  // Top users (admin only)
  const topUsers = isAdmin
    ? db.prepare("SELECT u.email, COUNT(*) as count FROM history h JOIN users u ON h.user_id = u.id GROUP BY h.user_id ORDER BY count DESC LIMIT 5").all()
    : [];

  const totalUsers = isAdmin
    ? db.prepare("SELECT COUNT(*) as n FROM users WHERE is_active = 1").get().n
    : null;

  res.json({ totalDocs, docsThisMonth, totalEntities, entitiesByType, byDay, topUsers, totalUsers });
});

module.exports = router;
