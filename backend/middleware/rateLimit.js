const db = require('../db/database');

function anonymizationRateLimit(req, res, next) {
  const userId = req.user.id;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = db.prepare(
    "SELECT COUNT(*) as count FROM history WHERE user_id = ? AND created_at > ?"
  ).get(userId, oneHourAgo);

  if (count >= 10) {
    return res.status(429).json({
      error: 'Limite atteinte : maximum 10 anonymisations par heure'
    });
  }
  next();
}

module.exports = { anonymizationRateLimit };
