const express = require('express');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/database');
const { normalizeEntityTypes } = require('../utils/normalizeTypes');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const isAdmin   = req.user.role === 'admin';
  const uid       = req.user.id;
  const uf        = isAdmin ? '' : 'AND h.user_id = ?';
  const up        = isAdmin ? [] : [uid];

  const totalDocs = db.prepare(
    `SELECT COUNT(*) as n FROM history h WHERE 1=1 ${uf}`
  ).get(...up).n;

  const docsThisMonth = db.prepare(
    `SELECT COUNT(*) as n FROM history h WHERE created_at >= date('now','start of month') ${uf}`
  ).get(...up).n;

  const docsLastMonth = db.prepare(
    `SELECT COUNT(*) as n FROM history h
     WHERE created_at >= date('now','start of month','-1 month')
       AND created_at <  date('now','start of month') ${uf}`
  ).get(...up).n;

  // Aggregate entity stats from history rows
  const rows = db.prepare(
    `SELECT entity_count, entity_types FROM history h WHERE 1=1 ${uf}`
  ).all(...up);

  let totalEntities = 0;
  const entitiesByType = {};
  for (const row of rows) {
    totalEntities += (row.entity_count || 0);
    try {
      const raw   = JSON.parse(row.entity_types || '{}');
      const types = normalizeEntityTypes(raw);
      for (const [k, v] of Object.entries(types)) {
        entitiesByType[k] = (entitiesByType[k] || 0) + v;
      }
    } catch {}
  }

  // Last 30 days — always 30 entries, days with 0 count included
  const byDayRaw = db.prepare(
    `SELECT date(created_at) as day, COUNT(*) as count
     FROM history h
     WHERE created_at >= date('now','-29 days') ${uf}
     GROUP BY day ORDER BY day`
  ).all(...up);

  const dayMap = {};
  for (const r of byDayRaw) dayMap[r.day] = r.count;

  const byDay = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.push({ day: key, count: dayMap[key] || 0 });
  }

  // Average duration
  const avgRow = db.prepare(
    `SELECT AVG(duration_ms) as avg FROM history h WHERE duration_ms > 0 ${uf}`
  ).get(...up);
  const avgDuration = avgRow?.avg ? Math.round(avgRow.avg) : null;

  // Top users (admin only)
  const topUsers = isAdmin
    ? db.prepare(
        `SELECT u.email, COUNT(*) as count, SUM(entity_count) as entities
         FROM history h JOIN users u ON h.user_id = u.id
         GROUP BY h.user_id ORDER BY count DESC LIMIT 5`
      ).all()
    : [];

  const totalUsers = isAdmin
    ? db.prepare("SELECT COUNT(*) as n FROM users WHERE is_active = 1").get().n
    : null;

  res.json({
    totalDocs,
    docsThisMonth,
    docsLastMonth,
    totalEntities,
    entitiesByType,
    byDay,
    avgDuration,
    topUsers,
    totalUsers,
  });
});

module.exports = router;
