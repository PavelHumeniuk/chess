import fs from 'node:fs';
import path from 'node:path';

import type { PuzzleProgressRow, PuzzleProgressUpsert, UserRow } from './types';

interface DatabaseLike {
  pragma(statement: string): void;
  exec(statement: string): void;
  prepare(statement: string): any;
}

interface RunResult {
  lastInsertRowid: number | bigint;
}

const Database = require('better-sqlite3') as new (filename: string) => DatabaseLike;

const DATA_DIR = path.join(process.cwd(), 'data');
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

const findUserByGoogleIdStatement = db.prepare('SELECT * FROM users WHERE google_id = ?') as {
  get(googleId: string): UserRow | undefined;
};

const findUserByIdStatement = db.prepare('SELECT * FROM users WHERE id = ?') as {
  get(id: number): UserRow | undefined;
};

const createUserStatement = db.prepare(`
  INSERT INTO users (google_id, email, name, avatar) VALUES (?, ?, ?, ?)
`) as {
  run(googleId: string, email: string, name: string | null, avatar: string | null): RunResult;
};

/**
 * Finds an existing user by Google ID or creates one. Returns the user row.
 */
export function findOrCreateUser(googleId: string, email: string, name: string | null, avatar: string | null): UserRow {
  let user = findUserByGoogleIdStatement.get(googleId);
  if (!user) {
    const info = createUserStatement.run(googleId, email, name, avatar);
    user = findUserByIdStatement.get(Number(info.lastInsertRowid));
  }

  if (!user) {
    throw new Error('Failed to create or load user');
  }

  return user;
}

const getPuzzleProgressStatement = db.prepare(`
  SELECT * FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?
`) as {
  get(userId: number, puzzleId: string): PuzzleProgressRow | undefined;
};

const upsertPuzzleProgressStatement = db.prepare(`
  INSERT INTO puzzle_progress (user_id, puzzle_id, interval, ease, attempts, successes, next_due, last_seen)
  VALUES (@userId, @puzzleId, @interval, @ease, @attempts, @successes, @nextDue, @lastSeen)
  ON CONFLICT(user_id, puzzle_id) DO UPDATE SET
    interval  = excluded.interval,
    ease      = excluded.ease,
    attempts  = excluded.attempts,
    successes = excluded.successes,
    next_due  = excluded.next_due,
    last_seen = excluded.last_seen
`) as {
  run(params: PuzzleProgressUpsert): RunResult;
};

const getAllProgressStatement = db.prepare(`
  SELECT * FROM puzzle_progress WHERE user_id = ?
`) as {
  all(userId: number): PuzzleProgressRow[];
};

export const getPuzzleProgress = {
  get(userId: number, puzzleId: string): PuzzleProgressRow | undefined {
    return getPuzzleProgressStatement.get(userId, puzzleId);
  },
};

export const upsertPuzzleProgress = {
  run(params: PuzzleProgressUpsert): RunResult {
    return upsertPuzzleProgressStatement.run(params);
  },
};

export const getAllProgress = {
  all(userId: number): PuzzleProgressRow[] {
    return getAllProgressStatement.all(userId);
  },
};

export function isDueDate(nextDue: string, now = new Date()): boolean {
  const dueAt = new Date(nextDue);
  return Number.isFinite(dueAt.getTime()) && dueAt <= now;
}

export function getDueToday(userId: number, now = new Date()): PuzzleProgressRow[] {
  return getAllProgress.all(userId).filter((progress) => isDueDate(progress.next_due, now));
}

export { db };
