import fs from 'node:fs';
import path from 'node:path';

import type { GameInsert, GameRow, PuzzleProgressRow, PuzzleProgressUpsert, UserRow } from './types';

interface DatabaseLike {
  pragma(statement: string): void;
  exec(statement: string): void;
  prepare(statement: string): any;
}

interface RunResult {
  lastInsertRowid: number | bigint;
}

interface ChangeResult {
  changes: number;
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

  CREATE TABLE IF NOT EXISTS games (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    played_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    bot_rating   INTEGER NOT NULL,
    player_color TEXT NOT NULL CHECK(player_color IN ('w', 'b')),
    result       TEXT NOT NULL CHECK(result IN ('win', 'loss', 'draw')),
    moves_json   TEXT NOT NULL,
    total_moves  INTEGER NOT NULL
  );
`);

const gameColumns = (db.prepare('PRAGMA table_info(games)') as { all(): Array<{ name: string }> }).all();
if (!gameColumns.some((column) => column.name === 'move_times_json')) {
  db.exec(`ALTER TABLE games ADD COLUMN move_times_json TEXT`);
}

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

// --- Games ---

const insertGameStatement = db.prepare(`
  INSERT INTO games (user_id, bot_rating, player_color, result, moves_json, move_times_json, total_moves)
  VALUES (@userId, @botRating, @playerColor, @result, @movesJson, @moveTimesJson, @totalMoves)
`) as {
  run(params: GameInsert): RunResult;
};

const getGamesStatement = db.prepare(`
  SELECT id, played_at, bot_rating, player_color, result, total_moves
  FROM games
  WHERE user_id = ?
  ORDER BY played_at DESC
`) as {
  all(userId: number): Omit<GameRow, 'moves_json' | 'move_times_json'>[];
};

const getGameByIdStatement = db.prepare(`
  SELECT id, played_at, bot_rating, player_color, result, moves_json, move_times_json, total_moves
  FROM games
  WHERE id = ? AND user_id = ?
`) as {
  get(id: number, userId: number): GameRow | undefined;
};

const deleteGameByIdStatement = db.prepare(`
  DELETE FROM games
  WHERE id = ? AND user_id = ?
`) as {
  run(id: number, userId: number): ChangeResult;
};

export const insertGame = {
  run(params: GameInsert): RunResult {
    return insertGameStatement.run(params);
  },
};

export const getGames = {
  all(userId: number): Omit<GameRow, 'moves_json' | 'move_times_json'>[] {
    return getGamesStatement.all(userId);
  },
};

export const getGameById = {
  get(id: number, userId: number): GameRow | undefined {
    return getGameByIdStatement.get(id, userId);
  },
};

export const deleteGameById = {
  run(id: number, userId: number): ChangeResult {
    return deleteGameByIdStatement.run(id, userId);
  },
};

export { db };
