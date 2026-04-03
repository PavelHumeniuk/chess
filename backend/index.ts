require('dotenv').config({ quiet: true });

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { getMe, googleLogin, logout } from './auth';
import {
  getAllProgress,
  getDueToday,
  getGameById,
  getGames,
  getPuzzleProgress,
  insertGame,
  upsertPuzzleProgress,
} from './db';
import requireAuth from './middleware/requireAuth';
import type {
  EndgameRecord,
  NextFunction,
  PolgarData,
  PolgarProblem,
  PuzzleProgressRow,
  RequestLike,
  ResponseLike,
} from './types';

const express = require('express') as {
  (): any;
  Router(): any;
  json(): unknown;
};
const cors = require('cors') as (options: Record<string, unknown>) => unknown;

const app = express();
const api = express.Router();
const port = Number(process.env.PORT || 3001);
const STOCKFISH_PATH = process.env.STOCKFISH_PATH || 'stockfish';
const STOCKFISH_TIMEOUT_MS = Number(process.env.STOCKFISH_TIMEOUT_MS || 8000);
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.DOMAIN ? [`https://${process.env.DOMAIN}`] : []),
];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const CORS_ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_CORS_ORIGINS;
const computeLimiterHits = new Map<string, { count: number; windowStart: number }>();
const ENDGAME_LEVEL_ALIASES = new Map<string, string>([
  ['review_due', 'review_due'],
  ['review', 'review_due'],
  ['beginner_class_d', 'beginner_class_d'],
  ['beginners_to_class_d', 'beginner_class_d'],
  ['beginners_class_d', 'beginner_class_d'],
  ['beginner_d', 'beginner_class_d'],
  ['class_d', 'beginner_class_d'],
  ['d', 'beginner_class_d'],
  ['class_c', 'class_c'],
  ['c', 'class_c'],
  ['class_b', 'class_b'],
  ['b', 'class_b'],
  ['class_a', 'class_a'],
  ['a', 'class_a'],
  ['experts', 'experts'],
  ['expert', 'experts'],
  ['masters', 'masters'],
  ['master', 'masters'],
]);

function parseIntegerInRange(value: unknown, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readJsonFile<T>(fileName: string): T {
  const bundledFilePath = path.join(__dirname, 'data', fileName);
  const filePath = fs.existsSync(bundledFilePath)
    ? bundledFilePath
    : path.join(process.cwd(), 'data', fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function normalizeLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function canonicalizeEndgameLevel(level: string): string {
  const normalized = normalizeLookupKey(level);
  return ENDGAME_LEVEL_ALIASES.get(normalized) || normalized;
}

function createComputeRateLimiter(limit = 40, windowMs = 60_000) {
  return (req: RequestLike, res: ResponseLike, next: NextFunction): ResponseLike | void => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const existing = computeLimiterHits.get(key);

    if (!existing || now - existing.windowStart > windowMs) {
      computeLimiterHits.set(key, { count: 1, windowStart: now });
      return next();
    }

    existing.count += 1;
    if (existing.count > limit) {
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    return next();
  };
}

app.use(cors({
  origin(origin: string | undefined, callback: (error: Error | null, success?: boolean) => void) {
    // Non-browser clients may not send origin.
    if (!origin) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// ─── Auth Routes ─────────────────────────────────────────────────────────────
api.post('/auth/google', googleLogin);
api.get('/auth/me', getMe);
api.post('/auth/logout', logout);

// ─── Stockfish helpers ────────────────────────────────────────────────────────
function askStockfish(commands: string[], timeoutMs = STOCKFISH_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const stockfish = spawn(STOCKFISH_PATH);
    let output = '';
    let settled = false;

    const finish = (error: Error | null, result = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (!stockfish.killed) {
        stockfish.kill('SIGTERM');
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      finish(new Error('Stockfish request timed out'));
    }, timeoutMs);

    stockfish.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('bestmove')) {
        stockfish.stdin.write('quit\n');
      }
    });

    stockfish.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    stockfish.on('close', (code) => {
      if (settled) return;
      if (code !== 0 && !output.includes('bestmove')) {
        console.error(`Stockfish exited with code ${code}`);
        return finish(new Error(`Stockfish exited with code ${code}`));
      }
      finish(null, output);
    });

    stockfish.on('error', (error) => {
      console.error(`Failed to start Stockfish at "${STOCKFISH_PATH}":`, error.message);
      finish(new Error(`Stockfish path error: ${error.message}`));
    });

    try {
      commands.forEach((command) => stockfish.stdin.write(`${command}\n`));
      if (!commands.some((command) => command.startsWith('go'))) {
        stockfish.stdin.write('go depth 10\n');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Error writing to Stockfish stdin:', message);
      finish(error instanceof Error ? error : new Error(message));
    }
  });
}

function parseEval(output: string): { score: number; mate: number | null } {
  const lines = output.split('\n');
  let mate: number | null = null;
  let score = 0;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const mateMatch = lines[index]?.match(/score mate (-?\d+)/);
    if (mateMatch) {
      mate = Number.parseInt(mateMatch[1], 10);
      score = mate > 0 ? 10000 : -10000;
      break;
    }
    const match = lines[index]?.match(/score cp (-?\d+)/);
    if (match) {
      score = Number.parseInt(match[1], 10);
      break;
    }
  }
  return { score, mate };
}

function parseBestMove(output: string): string | null {
  const match = output.match(/bestmove\s+(\S+)/);
  return match ? match[1] : null;
}

// ─── Stockfish API ────────────────────────────────────────────────────────────
const computeRateLimiter = createComputeRateLimiter();

api.post('/eval', computeRateLimiter, async (req: RequestLike<{ fen?: string; depth?: unknown }>, res: ResponseLike) => {
  const fen = readString(req.body?.fen);
  const depth = parseIntegerInRange(req.body?.depth, 12, 1, 18);
  if (!fen) return res.status(400).json({ error: 'FEN is required' });
  try {
    const output = await askStockfish(['uci', `position fen ${fen}`, `go depth ${depth}`]);
    return res.json(parseEval(output));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Stockfish error' });
  }
});

api.post('/bestmove', computeRateLimiter, async (req: RequestLike<{ fen?: string; depth?: unknown; skillLevel?: unknown }>, res: ResponseLike) => {
  const fen = readString(req.body?.fen);
  const depth = parseIntegerInRange(req.body?.depth, 12, 1, 18);
  const skillLevel = parseIntegerInRange(req.body?.skillLevel, 20, 0, 20);
  if (!fen) return res.status(400).json({ error: 'FEN is required' });
  try {
    const output = await askStockfish([
      'uci',
      `setoption name Skill Level value ${skillLevel}`,
      `position fen ${fen}`,
      `go depth ${depth}`,
    ]);
    return res.json({ bestmove: parseBestMove(output) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Stockfish error' });
  }
});

// ─── Puzzle Data ─────────────────────────────────────────────────────────────
const polgarData = readJsonFile<PolgarData>('polgar_puzzles.json');
const endgames = readJsonFile<EndgameRecord[]>('endgames.json');

api.get('/puzzle/endgame', requireAuth, (req: RequestLike<unknown, { level?: unknown }>, res: ResponseLike) => {
  const level = readString(req.query?.level);
  const canonicalLevel = canonicalizeEndgameLevel(level);
  const userId = req.user!.id;
  const progress = getAllProgress.all(userId).filter((progressRow) => progressRow.puzzle_id.startsWith('endgame-'));
  const seenIds = new Set(progress.map((progressRow) => progressRow.puzzle_id));
  const dueIds = new Set(getDueToday(userId).map((progressRow) => progressRow.puzzle_id));
  const isReviewDue = canonicalLevel === 'review_due';

  let filtered = canonicalLevel && !isReviewDue
    ? endgames.filter((position) => canonicalizeEndgameLevel(position.level) === canonicalLevel)
    : endgames;

  if (filtered.length === 0) {
    return res.status(404).json({ error: 'No endgame positions found for that level.' });
  }

  if (isReviewDue) {
    filtered = filtered.filter((position) => dueIds.has(position.id));
    if (filtered.length === 0) {
      return res.status(404).json({ error: 'No endgames due for review!' });
    }
  }

  let pool = isReviewDue ? filtered : filtered.filter((position) => dueIds.has(position.id));
  if (!isReviewDue && pool.length === 0) {
    pool = filtered.filter((position) => !seenIds.has(position.id));
  }
  if (!isReviewDue && pool.length === 0) {
    pool = filtered;
  }

  const choice = pool[Math.floor(Math.random() * pool.length)]!;
  const categoryTotal = isReviewDue
    ? filtered.length
    : endgames.filter((position) => position.level === choice.level).length;
  const categoryRemaining = isReviewDue
    ? filtered.length
    : Math.max(categoryTotal - new Set(
      progress
        .filter((progressRow) => endgames.some((position) => position.id === progressRow.puzzle_id && position.level === choice.level))
        .map((progressRow) => progressRow.puzzle_id),
    ).size, 0);

  return res.json({
    ...choice,
    categoryRemaining,
    categoryTotal,
  });
});

// ─── SRS helpers (using DB) ───────────────────────────────────────────────────
function calcSRS(existing: PuzzleProgressRow | undefined, isSuccess: boolean) {
  let interval = existing?.interval ?? 1;
  let ease = existing?.ease ?? 2.5;
  const attempts = (existing?.attempts ?? 0) + 1;
  const successes = (existing?.successes ?? 0) + (isSuccess ? 1 : 0);

  if (isSuccess) {
    interval = Math.ceil(interval * ease);
    ease = Math.min(3.0, ease + 0.1);
  } else {
    interval = 1;
    ease = Math.max(1.3, ease - 0.2);
  }

  const nextDue = new Date();
  nextDue.setDate(nextDue.getDate() + interval);

  return { interval, ease, attempts, successes, nextDue: nextDue.toISOString() };
}

// ─── Polgar Puzzles ───────────────────────────────────────────────────────────
api.get('/puzzle/polgar', requireAuth, (req: RequestLike<unknown, { type?: unknown }>, res: ResponseLike) => {
  const type = readString(req.query?.type);
  const userId = req.user!.id;
  const mateInTwoChunkMatch = type.match(/^Mate in Two: (\d+)-(\d+)$/);

  let filtered = polgarData.problems;

  // Build set of seen puzzle IDs for this user
  const progress = getAllProgress.all(userId);
  const seenIds = new Set(progress.map((progressRow) => progressRow.puzzle_id));

  if (type === 'Review Due') {
    const dueItems = getDueToday(userId);
    const dueIds = new Set(dueItems.map((progressRow) => progressRow.puzzle_id));
    if (dueIds.size === 0) {
      return res.status(404).json({ error: 'No puzzles due for review!' });
    }
    filtered = filtered.filter((problem) => dueIds.has(`polgar-${problem.problemid}`));
  } else if (mateInTwoChunkMatch) {
    const start = Number.parseInt(mateInTwoChunkMatch[1], 10);
    const end = Number.parseInt(mateInTwoChunkMatch[2], 10);
    filtered = filtered
      .filter((problem) => problem.type === 'Mate in Two')
      .filter((problem) => Number(problem.problemid) >= start && Number(problem.problemid) <= end)
      .filter((problem) => !seenIds.has(`polgar-${problem.problemid}`));
  } else if (type) {
    filtered = filtered
      .filter((problem) => problem.type.toLowerCase().includes(type.toLowerCase()))
      .filter((problem) => !seenIds.has(`polgar-${problem.problemid}`));
  }

  if (filtered.length === 0) {
    return res.status(404).json({ error: 'No new puzzles found! Everything mastered?' });
  }

  const problem = filtered[Math.floor(Math.random() * filtered.length)]!;
  return res.json({
    id: `polgar-${problem.problemid}`,
    fen: problem.fen,
    moves: [],
    solution: problem.moves.split(';').map((move) => move.replace('-', '')),
    rating: 1500,
    themes: [problem.type, 'polgar'],
    categoryRemaining: filtered.length,
    categoryTotal: type === 'Review Due'
      ? filtered.length
      : mateInTwoChunkMatch
        ? polgarData.problems.filter((candidate: PolgarProblem) => {
          const id = Number(candidate.problemid);
          return candidate.type === 'Mate in Two'
            && id >= Number.parseInt(mateInTwoChunkMatch[1], 10)
            && id <= Number.parseInt(mateInTwoChunkMatch[2], 10);
        }).length
        : type
          ? polgarData.problems.filter((candidate: PolgarProblem) => candidate.type.toLowerCase().includes(type.toLowerCase())).length
          : polgarData.problems.length,
  });
});

// ─── Progress API ─────────────────────────────────────────────────────────────

// GET /progress/due — puzzles due for review today
api.get('/progress/due', requireAuth, (req: RequestLike, res: ResponseLike) => {
  const due = getDueToday(req.user!.id);
  return res.json(due);
});

// GET /progress/all — full progress for stats page
api.get('/progress/all', requireAuth, (req: RequestLike, res: ResponseLike) => {
  const all = getAllProgress.all(req.user!.id);
  return res.json(all);
});

function persistProgressResult(userId: number, puzzleId: string, success: boolean): { nextDue: string } {
  const existing = getPuzzleProgress.get(userId, puzzleId);
  const { interval, ease, attempts, successes, nextDue } = calcSRS(existing, success);

  upsertPuzzleProgress.run({
    userId,
    puzzleId,
    interval,
    ease,
    attempts,
    successes,
    nextDue,
    lastSeen: new Date().toISOString(),
  });

  return { nextDue };
}

// POST /progress/:puzzleId — record a puzzle result and update SRS
api.post('/progress/:puzzleId', requireAuth, (req: RequestLike<{ success?: unknown }, Record<string, unknown>, { puzzleId: string }>, res: ResponseLike) => {
  const puzzleId = req.params?.puzzleId || '';
  const success = Boolean(req.body?.success);
  const userId = req.user!.id;

  const { nextDue } = persistProgressResult(userId, puzzleId, success);
  return res.json({ ok: true, nextDue });
});

// GET /puzzle/stats — summary stats for the logged-in user
api.get('/puzzle/stats', requireAuth, (req: RequestLike<unknown, { kind?: unknown }>, res: ResponseLike) => {
  const kind = readString(req.query?.kind);
  const prefix = kind === 'polgar' ? 'polgar-' : kind === 'endgame' ? 'endgame-' : '';
  const all = getAllProgress.all(req.user!.id).filter((progressRow) => !prefix || progressRow.puzzle_id.startsWith(prefix));
  const totalAttempts = all.reduce((sum, progressRow) => sum + progressRow.attempts, 0);
  const totalSuccess = all.reduce((sum, progressRow) => sum + progressRow.successes, 0);

  const forecast: Record<string, number> = {};
  const now = new Date();
  for (let index = 0; index < 7; index += 1) {
    const day = new Date();
    day.setDate(now.getDate() + index);
    const key = day.toISOString().split('T')[0]!;
    forecast[key] = all.filter((progressRow) => (progressRow.next_due || '').startsWith(key)).length;
  }

  return res.json({
    totalPuzzlesTouched: all.length,
    totalAttempts,
    successRate: totalAttempts === 0 ? '0' : (totalSuccess / totalAttempts * 100).toFixed(1),
    dueReviewCount: all.filter((progressRow) => new Date(progressRow.next_due) <= now).length,
    forecast,
  });
});

// Legacy endpoint — kept for backwards compat; now uses DB
api.post('/puzzle/result', requireAuth, (req: RequestLike<{ id?: unknown; success?: unknown }>, res: ResponseLike) => {
  const puzzleId = readString(req.body?.id);
  const success = Boolean(req.body?.success);
  const userId = req.user!.id;

  persistProgressResult(userId, puzzleId, success);
  return res.json({ ok: true });
});

// ─── Games API ────────────────────────────────────────────────────────────────

// POST /games — save a finished bot game
api.post('/games', requireAuth, (req: RequestLike<{ botRating?: unknown; playerColor?: unknown; result?: unknown; moves?: unknown }>, res: ResponseLike) => {
  const userId = req.user!.id;
  const botRating = parseIntegerInRange(req.body?.botRating, 800, 400, 3200);
  const playerColor = readString(req.body?.playerColor);
  const result = readString(req.body?.result);
  const moves = req.body?.moves;

  if (!['w', 'b'].includes(playerColor)) {
    return res.status(400).json({ error: 'playerColor must be w or b' });
  }
  if (!['win', 'loss', 'draw'].includes(result)) {
    return res.status(400).json({ error: 'result must be win, loss, or draw' });
  }
  if (!Array.isArray(moves)) {
    return res.status(400).json({ error: 'moves must be an array' });
  }

  const info = insertGame.run({
    userId,
    botRating,
    playerColor: playerColor as 'w' | 'b',
    result: result as 'win' | 'loss' | 'draw',
    movesJson: JSON.stringify(moves),
    totalMoves: moves.length,
  });

  return res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

// GET /games — list of games for the logged-in user (no move data)
api.get('/games', requireAuth, (req: RequestLike, res: ResponseLike) => {
  const rows = getGames.all(req.user!.id);
  return res.json(rows);
});

// GET /games/:id — single game with full move list
api.get('/games/:id', requireAuth, (req: RequestLike<unknown, Record<string, unknown>, { id: string }>, res: ResponseLike) => {
  const id = parseIntegerInRange(req.params?.id, 0, 1, Number.MAX_SAFE_INTEGER);
  if (id === 0) return res.status(400).json({ error: 'Invalid game id' });

  const row = getGameById.get(id, req.user!.id);
  if (!row) return res.status(404).json({ error: 'Game not found' });

  let moves: string[] = [];
  try { moves = JSON.parse(row.moves_json) as string[]; } catch { /* leave empty */ }

  return res.json({ ...row, moves, moves_json: undefined });
});

// Accept both `/api/*` and legacy unprefixed routes so auth keeps working
// regardless of proxy prefix-stripping behavior.
app.use('/api', api);
app.use(api);

app.use((error: { status?: number; statusCode?: number; message?: string }, _req: RequestLike, res: ResponseLike, next: NextFunction) => {
  if (res.headersSent) return next(error);

  const status = Number(error.status || error.statusCode || 500);
  const message = status >= 500 ? 'Internal Server Error' : (error.message || 'Request failed');
  console.error('API error:', error);
  return res.status(status).json({ error: message });
});

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Chess backend listening at http://localhost:${port}`);
  });
}

export default app;
