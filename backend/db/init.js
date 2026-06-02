const db = require('./database');
const bcrypt = require('bcryptjs');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      entity_count INTEGER NOT NULL DEFAULT 0,
      categories TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations — add columns silently if they don't exist yet
  try { db.exec("ALTER TABLE history ADD COLUMN duration_ms INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE history ADD COLUMN entity_types TEXT DEFAULT '{}'"); } catch {}

  const admin = db.prepare("SELECT id FROM users WHERE email = ?").get('admin@entreprise.fr');
  if (!admin) {
    const hash = bcrypt.hashSync('Admin1234!', 12);
    db.prepare(
      "INSERT INTO users (email, password_hash, role, must_change_password) VALUES (?, ?, 'admin', 1)"
    ).run('admin@entreprise.fr', hash);
    console.log('Compte admin par défaut créé : admin@entreprise.fr / Admin1234!');
  }
}

module.exports = { initDatabase };
