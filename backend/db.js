const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'chess.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id  TEXT UNIQUE NOT NULL,
    email      TEXT NOT NULL,
    name       TEXT,
    avatar     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS puzzle_progress (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    puzzle_id   TEXT NOT NULL,
    interval    INTEGER DEFAULT 1,
    ease        REAL DEFAULT 2.5,
    attempts    INTEGER DEFAULT 0,
    successes   INTEGER DEFAULT 0,
    next_due    DATETIME NOT NULL,
    last_seen   DATETIME,
    UNIQUE(user_id, puzzle_id)
  );
`);

// --- Prepared Statements ---

const findUserByGoogleId = db.prepare(`SELECT * FROM users WHERE google_id = ?`);

const createUser = db.prepare(`
  INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)
`);

/**
 * Finds an existing user by Google ID or creates one. Returns the user row.
 */
function findOrCreateUser(googleId, email, name, avatar) {
  let user = findUserByGoogleId.get(googleId);
  if (!user) {
    const info = createUser.run(googleId, email, name, avatar);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  }
  return user;
}

const getPuzzleProgress = db.prepare(`
  SELECT * FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?
`);

const upsertPuzzleProgress = db.prepare(`
  INSERT INTO puzzle_progress (user_id, puzzle_id, interval, ease, attempts, successes, next_due, last_seen)
  VALUES (@userId, @puzzleId, @interval, @ease, @attempts, @successes, @nextDue, @lastSeen)
  ON CONFLICT(user_id, puzzle_id) DO UPDATE SET
    interval  = excluded.interval,
    ease      = excluded.ease,
    attempts  = excluded.attempts,
    successes = excluded.successes,
    next_due  = excluded.next_due,
    last_seen = excluded.last_seen
`);

const getDueToday = db.prepare(`
  SELECT * FROM puzzle_progress
  WHERE user_id = ? AND next_due <= datetime('now')
`);

const getAllProgress = db.prepare(`
  SELECT * FROM puzzle_progress WHERE user_id = ?
`);

module.exports = {
  db,
  findOrCreateUser,
  getPuzzleProgress,
  upsertPuzzleProgress,
  getDueToday,
  getAllProgress,
};
