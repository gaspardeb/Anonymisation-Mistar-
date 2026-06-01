const jwt = require('jsonwebtoken');
const db = require('../db/database');

function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare(
      'SELECT id, email, role, is_active, must_change_password FROM users WHERE id = ?'
    ).get(payload.userId);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Compte désactivé ou introuvable' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
