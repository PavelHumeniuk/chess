import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Board from '../components/Board';
import { getGames, getGame } from '../engine/eval';
import type { GameRecord } from '../engine/eval';
import { ChessGame } from '../engine/ChessGame';
import type { Board as BoardData, Square } from '../engine/types';
import './GameHistory.css';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function resultLabel(result: GameRecord['result']): string {
  if (result === 'win') return '✅ Win';
  if (result === 'loss') return '❌ Loss';
  return '🤝 Draw';
}

function colorLabel(color: 'w' | 'b'): string {
  return color === 'w' ? '♔ White' : '♚ Black';
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ─── Stats computation ────────────────────────────────────────────────────────

interface RecordStats {
  wins: number; losses: number; draws: number; total: number; winPct: number;
}

interface GameStats {
  overall: RecordStats;
  asWhite: RecordStats;
  asBlack: RecordStats;
  last7: RecordStats;
  last30: RecordStats;
  last365: RecordStats;
  byElo: { label: string; range: string; stats: RecordStats }[];
  currentStreak: { type: 'win' | 'loss' | 'draw' | null; count: number };
  bestWinStreak: number;
}

function makeRecord(subset: GameRecord[]): RecordStats {
  const wins = subset.filter(g => g.result === 'win').length;
  const losses = subset.filter(g => g.result === 'loss').length;
  const draws = subset.filter(g => g.result === 'draw').length;
  const total = subset.length;
  return { wins, losses, draws, total, winPct: total > 0 ? Math.round((wins / total) * 100) : 0 };
}

const ELO_BRACKETS = [
  { label: 'Beginner', range: '≤1199', min: 0,    max: 1199 },
  { label: 'Club',     range: '1200–1599', min: 1200, max: 1599 },
  { label: 'Advanced', range: '1600–1999', min: 1600, max: 1999 },
  { label: 'Expert',   range: '2000–2399', min: 2000, max: 2399 },
  { label: 'Master',   range: '2400+',  min: 2400, max: Infinity },
];

function computeStats(games: GameRecord[]): GameStats {
  const cutoff7   = daysAgo(7);
  const cutoff30  = daysAgo(30);
  const cutoff365 = daysAgo(365);

  // Streak (games ordered newest first from API, so reverse for streak calculation)
  const ordered = [...games].reverse();
  let currentStreak: GameStats['currentStreak'] = { type: null, count: 0 };
  let bestWinStreak = 0, cur = 0;
  for (const g of ordered) {
    if (currentStreak.type === null) {
      currentStreak = { type: g.result, count: 1 };
    } else if (g.result === currentStreak.type) {
      currentStreak.count++;
    }
    if (g.result === 'win') { cur++; bestWinStreak = Math.max(bestWinStreak, cur); }
    else cur = 0;
  }

  return {
    overall:  makeRecord(games),
    asWhite:  makeRecord(games.filter(g => g.player_color === 'w')),
    asBlack:  makeRecord(games.filter(g => g.player_color === 'b')),
    last7:    makeRecord(games.filter(g => new Date(g.played_at) >= cutoff7)),
    last30:   makeRecord(games.filter(g => new Date(g.played_at) >= cutoff30)),
    last365:  makeRecord(games.filter(g => new Date(g.played_at) >= cutoff365)),
    byElo:    ELO_BRACKETS
      .map(b => ({
        label: b.label, range: b.range,
        stats: makeRecord(games.filter(g => g.bot_rating >= b.min && g.bot_rating <= b.max)),
      }))
      .filter(b => b.stats.total > 0),
    currentStreak,
    bestWinStreak,
  };
}

// ─── Stats Panel ──────────────────────────────────────────────────────────────

function RecordBar({ stats, compact }: { stats: RecordStats; compact?: boolean }) {
  const { wins, losses, draws, total } = stats;
  if (total === 0) return <span className="gh-stat-empty">No games</span>;
  const winPct   = (wins   / total) * 100;
  const lossPct  = (losses / total) * 100;
  const drawPct  = (draws  / total) * 100;
  return (
    <div className="gh-record">
      <div className="gh-record__bar">
        {winPct  > 0 && <div className="gh-bar-seg gh-bar-seg--win"  style={{ width: `${winPct}%`  }} />}
        {drawPct > 0 && <div className="gh-bar-seg gh-bar-seg--draw" style={{ width: `${drawPct}%` }} />}
        {lossPct > 0 && <div className="gh-bar-seg gh-bar-seg--loss" style={{ width: `${lossPct}%` }} />}
      </div>
      {!compact && (
        <div className="gh-record__labels">
          <span className="gh-rl gh-rl--win">{wins}W</span>
          <span className="gh-rl gh-rl--draw">{draws}D</span>
          <span className="gh-rl gh-rl--loss">{losses}L</span>
          <span className="gh-rl gh-rl--pct">{stats.winPct}%</span>
        </div>
      )}
    </div>
  );
}

function ActivityTile({ label, stats }: { label: string; stats: RecordStats }) {
  return (
    <div className="gh-act-tile">
      <div className="gh-act-tile__count">{stats.total}</div>
      <div className="gh-act-tile__label">{label}</div>
      {stats.total > 0 && (
        <div className="gh-act-tile__record">
          <span className="gh-rl gh-rl--win">{stats.wins}W</span>
          <span className="gh-rl gh-rl--draw">{stats.draws}D</span>
          <span className="gh-rl gh-rl--loss">{stats.losses}L</span>
        </div>
      )}
    </div>
  );
}

function StatsPanel({ stats }: { stats: GameStats }) {
  const streakIcon = stats.currentStreak.type === 'win' ? '🔥' :
                     stats.currentStreak.type === 'loss' ? '❄️' : '➖';
  const streakLabel = stats.currentStreak.type
    ? `${stats.currentStreak.count} ${stats.currentStreak.type}${stats.currentStreak.count > 1 ? 's' : ''}`
    : '—';

  return (
    <div className="gh-stats">
      {/* Overall record */}
      <section className="gh-stat-card gh-stat-card--full">
        <h3 className="gh-stat-card__title">Overall Record</h3>
        <div className="gh-overall">
          <div className="gh-overall__numbers">
            <span className="gh-overall__num gh-overall__num--win">{stats.overall.wins}<small>W</small></span>
            <span className="gh-overall__sep">/</span>
            <span className="gh-overall__num gh-overall__num--draw">{stats.overall.draws}<small>D</small></span>
            <span className="gh-overall__sep">/</span>
            <span className="gh-overall__num gh-overall__num--loss">{stats.overall.losses}<small>L</small></span>
          </div>
          <RecordBar stats={stats.overall} />
          <div className="gh-streak-row">
            <span className="gh-streak-badge">{streakIcon} Current streak: <strong>{streakLabel}</strong></span>
            {stats.bestWinStreak > 1 && (
              <span className="gh-streak-badge">🏆 Best win streak: <strong>{stats.bestWinStreak}</strong></span>
            )}
          </div>
        </div>
      </section>

      {/* Activity */}
      <section className="gh-stat-card gh-stat-card--full">
        <h3 className="gh-stat-card__title">Activity</h3>
        <div className="gh-act-grid">
          <ActivityTile label="Last 7 days"  stats={stats.last7}   />
          <ActivityTile label="Last 30 days" stats={stats.last30}  />
          <ActivityTile label="Last year"    stats={stats.last365} />
          <ActivityTile label="All time"     stats={stats.overall} />
        </div>
      </section>

      {/* By color */}
      <section className="gh-stat-card">
        <h3 className="gh-stat-card__title">By Color</h3>
        <div className="gh-color-grid">
          <div className="gh-color-row">
            <span className="gh-color-icon">♔</span>
            <span className="gh-color-name">White</span>
            <div className="gh-color-bar">
              <RecordBar stats={stats.asWhite} />
              <div className="gh-record__labels">
                <span className="gh-rl gh-rl--win">{stats.asWhite.wins}W</span>
                <span className="gh-rl gh-rl--draw">{stats.asWhite.draws}D</span>
                <span className="gh-rl gh-rl--loss">{stats.asWhite.losses}L</span>
                <span className="gh-rl gh-rl--pct">{stats.asWhite.winPct}%</span>
              </div>
            </div>
          </div>
          <div className="gh-color-row">
            <span className="gh-color-icon">♚</span>
            <span className="gh-color-name">Black</span>
            <div className="gh-color-bar">
              <RecordBar stats={stats.asBlack} />
              <div className="gh-record__labels">
                <span className="gh-rl gh-rl--win">{stats.asBlack.wins}W</span>
                <span className="gh-rl gh-rl--draw">{stats.asBlack.draws}D</span>
                <span className="gh-rl gh-rl--loss">{stats.asBlack.losses}L</span>
                <span className="gh-rl gh-rl--pct">{stats.asBlack.winPct}%</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* By ELO */}
      {stats.byElo.length > 0 && (
        <section className="gh-stat-card">
          <h3 className="gh-stat-card__title">Performance by Bot Rating</h3>
          <div className="gh-elo-table">
            <div className="gh-elo-row gh-elo-row--header">
              <span>Level</span><span>ELO</span><span>Record</span><span className="gh-elo-bar-col">Win rate</span>
            </div>
            {stats.byElo.map(b => (
              <div key={b.label} className="gh-elo-row">
                <span className="gh-elo-label">{b.label}</span>
                <span className="gh-elo-range">{b.range}</span>
                <span className="gh-elo-rec">
                  <span className="gh-rl gh-rl--win">{b.stats.wins}W</span>
                  <span className="gh-rl gh-rl--draw">{b.stats.draws}D</span>
                  <span className="gh-rl gh-rl--loss">{b.stats.losses}L</span>
                </span>
                <div className="gh-elo-bar-col">
                  <RecordBar stats={b.stats} compact />
                  <span className="gh-elo-pct">{b.stats.winPct}%</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

interface GameListProps {
  games: GameRecord[];
  loading: boolean;
  onSelect: (id: number) => void;
}

function GameList({ games, loading, onSelect }: GameListProps) {
  if (loading) {
    return <div className="gh-loading">Loading history…</div>;
  }
  if (games.length === 0) {
    return (
      <div className="gh-empty">
        <div className="gh-empty__icon">♟</div>
        <p>No games yet. Play a bot game to see it here!</p>
      </div>
    );
  }

  return (
    <div className="gh-list">
      {games.map((g) => (
        <button key={g.id} className={`gh-card gh-card--${g.result}`} onClick={() => onSelect(g.id)}>
          <div className="gh-card__top">
            <span className={`gh-badge gh-badge--${g.result}`}>{resultLabel(g.result)}</span>
            <span className="gh-card__date">{formatDate(g.played_at)} <span className="gh-card__time">{formatTime(g.played_at)}</span></span>
          </div>
          <div className="gh-card__bottom">
            <span className="gh-card__meta">🤖 Bot {g.bot_rating} ELO</span>
            <span className="gh-card__meta">{colorLabel(g.player_color)}</span>
            <span className="gh-card__meta">🔢 {g.total_moves} moves</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ─── Replay view ──────────────────────────────────────────────────────────────

// Build board state by replaying moves up to a given step
function buildBoardAtStep(moves: string[], step: number): {
  board: BoardData;
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
} {
  const g = new ChessGame();
  let lastMove: { from: Square; to: Square } | null = null;

  for (let i = 0; i < step; i++) {
    const san = moves[i];
    if (!san) break;
    const result = g.makeSanMove(san);
    if (result) lastMove = result;
  }

  const status = g.getStatus();
  let kingInCheck: Square | null = null;
  if (status.state === 'check') {
    kingInCheck = g.getKingSquare(status.turn);
  } else if (status.state === 'checkmate') {
    const loser = status.winner === 'w' ? 'b' : 'w';
    kingInCheck = g.getKingSquare(loser);
  }

  return { board: g.getBoard(), lastMove, kingInCheck };
}

interface GameReplayProps {
  game: GameRecord;
  onBack: () => void;
}

function GameReplay({ game, onBack }: GameReplayProps) {
  const moves = game.moves ?? [];
  const [step, setStep] = useState(moves.length);
  const moveListRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((target: number) => {
    setStep(Math.max(0, Math.min(moves.length, target)));
  }, [moves.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(step - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(step + 1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, goTo]);

  useEffect(() => {
    if (!moveListRef.current) return;
    const active = moveListRef.current.querySelector('.gh-move--active');
    active?.scrollIntoView({ block: 'nearest' });
  }, [step]);

  const { board, lastMove, kingInCheck } = buildBoardAtStep(moves, step);
  const isFlipped = game.player_color === 'b';

  const movePairs: { number: number; white: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ number: i / 2 + 1, white: moves[i]!, black: moves[i + 1] });
  }

  return (
    <div className="gh-replay">
      <div className="gh-replay__header">
        <button className="gh-back-btn" onClick={onBack}>← Games</button>
        <div className="gh-replay__meta">
          <span className={`gh-badge gh-badge--${game.result}`}>{resultLabel(game.result)}</span>
          <span>🤖 {game.bot_rating} ELO</span>
          <span>{colorLabel(game.player_color)}</span>
          <span className="gh-card__date">{formatDate(game.played_at)}</span>
        </div>
      </div>

      <div className="gh-replay__body">
        <div className="gh-replay__board-wrap">
          <Board
            board={board}
            selectedSquare={null}
            legalMoves={[]}
            lastMove={lastMove}
            kingInCheck={kingInCheck}
            isFlipped={isFlipped}
            onSquareClick={() => {/* read-only */}}
          />
          <div className="gh-controls">
            <button className="gh-ctrl-btn" onClick={() => goTo(0)} disabled={step === 0} title="Start">⏮</button>
            <button className="gh-ctrl-btn" onClick={() => goTo(step - 1)} disabled={step === 0} title="Previous (←)">◀</button>
            <span className="gh-ctrl-counter">{step} / {moves.length}</span>
            <button className="gh-ctrl-btn" onClick={() => goTo(step + 1)} disabled={step === moves.length} title="Next (→)">▶</button>
            <button className="gh-ctrl-btn" onClick={() => goTo(moves.length)} disabled={step === moves.length} title="End">⏭</button>
          </div>
          <p className="gh-controls__hint">← → to navigate</p>
        </div>

        <div className="gh-replay__moves" ref={moveListRef}>
          <div className="gh-move-row gh-move-row--header">
            <span>#</span><span>White</span><span>Black</span>
          </div>
          {movePairs.map((pair) => {
            const whiteIdx = (pair.number - 1) * 2 + 1;
            const blackIdx = whiteIdx + 1;
            return (
              <div key={pair.number} className="gh-move-row">
                <span className="gh-move-num">{pair.number}.</span>
                <button
                  className={`gh-move ${step === whiteIdx ? 'gh-move--active' : ''}`}
                  onClick={() => goTo(whiteIdx)}
                >
                  {pair.white}
                </button>
                {pair.black && (
                  <button
                    className={`gh-move ${step === blackIdx ? 'gh-move--active' : ''}`}
                    onClick={() => goTo(blackIdx)}
                  >
                    {pair.black}
                  </button>
                )}
              </div>
            );
          })}
          {moves.length === 0 && <p className="gh-empty-moves">No moves recorded.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function GameHistory() {
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGame, setSelectedGame] = useState<GameRecord | null>(null);
  const [loadingGame, setLoadingGame] = useState(false);
  const [showStats, setShowStats] = useState(true);

  useEffect(() => {
    getGames()
      .then(setGames)
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = useCallback(async (id: number) => {
    setLoadingGame(true);
    const g = await getGame(id);
    setLoadingGame(false);
    if (g) setSelectedGame(g);
  }, []);

  const stats = useMemo(() => (games.length > 0 ? computeStats(games) : null), [games]);

  if (loadingGame) return <div className="gh-loading">Loading game…</div>;

  if (selectedGame) {
    return <GameReplay game={selectedGame} onBack={() => setSelectedGame(null)} />;
  }

  return (
    <div className="gh-root">
      <div className="gh-header-row">
        <h2 className="gh-title">📋 Game History</h2>
        {stats && (
          <button className="gh-toggle-stats" onClick={() => setShowStats(s => !s)}>
            {showStats ? 'Hide Stats ▲' : 'Show Stats ▼'}
          </button>
        )}
      </div>

      {stats && showStats && <StatsPanel stats={stats} />}

      <h3 className="gh-section-title">Recent Games</h3>
      <GameList games={games} loading={loading} onSelect={handleSelect} />
    </div>
  );
}
