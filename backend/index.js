require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { spawn } = require('child_process');

const { googleLogin, getMe, logout } = require('./auth');
const requireAuth = require('./middleware/requireAuth');
const {
  getPuzzleProgress,
  upsertPuzzleProgress,
  getDueToday,
  getAllProgress,
} = require('./db');

const app = express();
const api = express.Router();
const port = process.env.PORT || 3001;
const STOCKFISH_PATH = process.env.STOCKFISH_PATH || 'stockfish';
const STOCKFISH_TIMEOUT_MS = Number(process.env.STOCKFISH_TIMEOUT_MS || 8000);
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
const CORS_ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_CORS_ORIGINS;
const computeLimiterHits = new Map();

function parseIntegerInRange(value, fallback, min, max) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function createComputeRateLimiter(limit = 40, windowMs = 60_000) {
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
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
  origin(origin, callback) {
    // Non-browser clients may not send origin.
    if (!origin) return callback(null, true);
    if (CORS_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(bodyParser.json());

// ─── Auth Routes ─────────────────────────────────────────────────────────────
api.post('/auth/google', googleLogin);
api.get('/auth/me', getMe);
api.post('/auth/logout', logout);

// ─── Stockfish helpers ────────────────────────────────────────────────────────
function askStockfish(commands, timeoutMs = STOCKFISH_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const stockfish = spawn(STOCKFISH_PATH);
    let output = '';
    let settled = false;

    const finish = (err, result = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (!stockfish.killed) {
        stockfish.kill('SIGTERM');
      }
      if (err) {
        reject(err);
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

    stockfish.on('error', (err) => {
      console.error(`Failed to start Stockfish at "${STOCKFISH_PATH}":`, err.message);
      finish(new Error(`Stockfish path error: ${err.message}`));
    });

    try {
      commands.forEach(cmd => stockfish.stdin.write(`${cmd}\n`));
      if (!commands.some(c => c.startsWith('go'))) {
        stockfish.stdin.write('go depth 10\n');
      }
    } catch (err) {
      console.error('Error writing to Stockfish stdin:', err.message);
      finish(err);
    }
  });
}

function parseEval(output) {
  const lines = output.split('\n');
  let mate = null;
  let score = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const mateMatch = lines[i].match(/score mate (-?\d+)/);
    if (mateMatch) { mate = parseInt(mateMatch[1]); score = mate > 0 ? 10000 : -10000; break; }
    const match = lines[i].match(/score cp (-?\d+)/);
    if (match) { score = parseInt(match[1]); break; }
  }
  return { score, mate };
}

function parseBestMove(output) {
  const match = output.match(/bestmove\s+(\S+)/);
  return match ? match[1] : null;
}

// ─── Stockfish API ────────────────────────────────────────────────────────────
const computeRateLimiter = createComputeRateLimiter();

api.post('/eval', computeRateLimiter, async (req, res) => {
  const { fen } = req.body;
  const depth = parseIntegerInRange(req.body?.depth, 12, 1, 18);
  if (!fen) return res.status(400).json({ error: 'FEN is required' });
  try {
    const output = await askStockfish(['uci', `position fen ${fen}`, `go depth ${depth}`]);
    res.json(parseEval(output));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Stockfish error' });
  }
});

api.post('/bestmove', computeRateLimiter, async (req, res) => {
  const { fen } = req.body;
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
    res.json({ bestmove: parseBestMove(output) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Stockfish error' });
  }
});

// ─── Puzzle Data ─────────────────────────────────────────────────────────────
const polgarData = require('./data/polgar_puzzles.json');
const endgames = require('./data/endgames.json');


api.get('/puzzle/endgame', (req, res) => {
  res.json(endgames[Math.floor(Math.random() * endgames.length)]);
});

// ─── SRS helpers (using DB) ───────────────────────────────────────────────────
function calcSRS(existing, isSuccess) {
  let interval = existing?.interval ?? 1;
  let ease     = existing?.ease     ?? 2.5;
  let attempts  = (existing?.attempts  ?? 0) + 1;
  let successes = (existing?.successes ?? 0) + (isSuccess ? 1 : 0);

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
api.get('/puzzle/polgar', requireAuth, (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : '';
  const userId = req.user.id;

  let filtered = polgarData.problems;

  // Build set of seen puzzle IDs for this user
  const progress = getAllProgress.all(userId);
  const seenIds = new Set(progress.map(p => p.puzzle_id));

  if (type === 'Review Due') {
    const dueItems = getDueToday.all(userId);
    const dueIds = new Set(dueItems.map(p => p.puzzle_id));
    if (dueIds.size === 0) {
      return res.status(404).json({ error: 'No puzzles due for review!' });
    }
    filtered = filtered.filter(p => dueIds.has(`polgar-${p.problemid}`));
  } else if (type) {
    filtered = filtered
      .filter(p => p.type.toLowerCase().includes(type.toLowerCase()))
      .filter(p => !seenIds.has(`polgar-${p.problemid}`));
  }

  if (filtered.length === 0) {
    return res.status(404).json({ error: 'No new puzzles found! Everything mastered?' });
  }

  const p = filtered[Math.floor(Math.random() * filtered.length)];
  res.json({
    id: `polgar-${p.problemid}`,
    fen: p.fen,
    moves: [],
    solution: p.moves.split(';').map(m => m.replace('-', '')),
    rating: 1500,
    themes: [p.type, 'polgar'],
    categoryRemaining: filtered.length,
    categoryTotal: type === 'Review Due'
      ? filtered.length
      : type
        ? polgarData.problems.filter(prob => prob.type.toLowerCase().includes(type.toLowerCase())).length
        : polgarData.problems.length,
  });
});

// ─── Progress API ─────────────────────────────────────────────────────────────

// GET /progress/due — puzzles due for review today
api.get('/progress/due', requireAuth, (req, res) => {
  const due = getDueToday.all(req.user.id);
  res.json(due);
});

// GET /progress/all — full progress for stats page
api.get('/progress/all', requireAuth, (req, res) => {
  const all = getAllProgress.all(req.user.id);
  res.json(all);
});

function persistProgressResult(userId, puzzleId, success) {
  const existing = getPuzzleProgress.get(userId, puzzleId);
  const { interval, ease, attempts, successes, nextDue } = calcSRS(existing, !!success);

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
api.post('/progress/:puzzleId', requireAuth, (req, res) => {
  const { puzzleId } = req.params;
  const { success } = req.body;
  const userId = req.user.id;

  const { nextDue } = persistProgressResult(userId, puzzleId, success);
  res.json({ ok: true, nextDue });
});

// GET /puzzle/stats — summary stats for the logged-in user
api.get('/puzzle/stats', requireAuth, (req, res) => {
  const all = getAllProgress.all(req.user.id);
  const totalAttempts = all.reduce((s, p) => s + p.attempts, 0);
  const totalSuccess  = all.reduce((s, p) => s + p.successes, 0);

  const forecast = {};
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(now.getDate() + i);
    const key = d.toISOString().split('T')[0];
    forecast[key] = all.filter(p => {
      return (p.next_due || '').startsWith(key);
    }).length;
  }

  res.json({
    totalPuzzlesTouched: all.length,
    totalAttempts,
    successRate: totalAttempts === 0 ? 0 : (totalSuccess / totalAttempts * 100).toFixed(1),
    dueReviewCount: all.filter(p => new Date(p.next_due) <= now).length,
    forecast,
  });
});

// Legacy endpoint — kept for backwards compat; now uses DB
api.post('/puzzle/result', requireAuth, (req, res) => {
  const { id, success } = req.body;
  const userId = req.user.id;

  persistProgressResult(userId, id, success);
  res.json({ ok: true });
});

// Accept both `/api/*` and legacy unprefixed routes so auth keeps working
// regardless of proxy prefix-stripping behavior.
app.use('/api', api);
app.use(api);

// ─── Start ────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Chess backend listening at http://localhost:${port}`);
  });
}

module.exports = app;
