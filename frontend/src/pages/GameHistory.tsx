import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Board from '../components/Board';
import { getGames, getGame, getAnalysis, deleteGame } from '../engine/eval';
import type { GameRecord, EngineAnalysis } from '../engine/eval';
import { ChessGame } from '../engine/ChessGame';
import type { Board as BoardData, Square } from '../engine/types';
import './GameHistory.css';

// ─── helpers ──────────────────────────────────────────────────────────────────

type TurnColor = 'w' | 'b';

interface ReviewLine {
  score: number;
  mate: number | null;
  sanLine: string[];
}

interface PositionAnalysis {
  score: number;
  mate: number | null;
  lines: ReviewLine[];
  bestMoveSan: string | null;
}

interface MoveReview {
  label: 'Best' | 'Missed opportunity' | 'Mistake' | 'Blunder';
  tone: 'best' | 'missed' | 'mistake' | 'blunder';
  loss: number;
  bestMoveSan: string | null;
}

interface ReplayPosition {
  board: BoardData;
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
  fen: string;
}

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

function formatScore(score: number, mate: number | null): string {
  if (mate !== null) {
    return mate > 0 ? `+M${mate}` : `-M${Math.abs(mate)}`;
  }
  const cp = score / 100;
  return cp > 0 ? `+${cp.toFixed(1)}` : cp.toFixed(1);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function normalizeSan(san: string | null | undefined): string {
  return (san ?? '').replace(/[+#?!]+/g, '');
}

function scoreForMover(score: number, mover: TurnColor): number {
  return mover === 'w' ? score : -score;
}

function formatPawnLoss(loss: number): string {
  return `${(Math.abs(loss) / 100).toFixed(1)} pawns`;
}

function toSanLine(fen: string, pv: string[], maxMoves = 4): string[] {
  const game = new ChessGame(fen);
  const sanLine: string[] = [];

  for (const uciMove of pv.slice(0, maxMoves)) {
    const san = game.getSanForUci(uciMove);
    if (!san) break;
    sanLine.push(san);
    game.makeSanMove(san);
  }

  return sanLine;
}

function toWhitePerspective(fen: string, score: number, mate: number | null) {
  const activeColor = fen.split(' ')[1] === 'b' ? -1 : 1;
  return {
    score: score * activeColor,
    mate: mate !== null ? mate * activeColor : null,
  };
}

function buildPositionAnalysis(fen: string, analysis: EngineAnalysis): PositionAnalysis {
  const lines = analysis.lines.map((line) => ({
    ...toWhitePerspective(fen, line.score, line.mate),
    sanLine: toSanLine(fen, line.pv),
  }));

  const top = toWhitePerspective(fen, analysis.score, analysis.mate);

  return {
    score: top.score,
    mate: top.mate,
    lines,
    bestMoveSan: lines[0]?.sanLine[0] ?? null,
  };
}

function classifyMoveReview(
  moveIndex: number,
  playedSan: string,
  before: PositionAnalysis,
  after: PositionAnalysis,
): MoveReview | null {
  const mover: TurnColor = moveIndex % 2 === 0 ? 'w' : 'b';
  const bestMoveSan = before.bestMoveSan;
  const beforeScore = scoreForMover(before.score, mover);
  const afterScore = scoreForMover(after.score, mover);
  const loss = beforeScore - afterScore;

  if (bestMoveSan && normalizeSan(bestMoveSan) === normalizeSan(playedSan)) {
    return { label: 'Best', tone: 'best', loss, bestMoveSan };
  }

  if (loss >= 250) {
    return { label: 'Blunder', tone: 'blunder', loss, bestMoveSan };
  }

  if (loss >= 120) {
    return { label: 'Mistake', tone: 'mistake', loss, bestMoveSan };
  }

  if (loss >= 70 && beforeScore >= 125) {
    return { label: 'Missed opportunity', tone: 'missed', loss, bestMoveSan };
  }

  return null;
}

function captureReplayPosition(game: ChessGame, lastMove: { from: Square; to: Square } | null): ReplayPosition {
  const status = game.getStatus();
  let kingInCheck: Square | null = null;

  if (status.state === 'check') {
    kingInCheck = game.getKingSquare(status.turn);
  } else if (status.state === 'checkmate') {
    const loser = status.winner === 'w' ? 'b' : 'w';
    kingInCheck = game.getKingSquare(loser);
  }

  return {
    board: game.getBoard(),
    lastMove,
    kingInCheck,
    fen: game.fen(),
  };
}

function buildReplayPositions(moves: string[]): ReplayPosition[] {
  const game = new ChessGame();
  const positions: ReplayPosition[] = [captureReplayPosition(game, null)];

  for (const san of moves) {
    const lastMove = game.makeSanMove(san);
    positions.push(captureReplayPosition(game, lastMove));
  }

  return positions;
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
  onDelete: (game: GameRecord) => void;
  deletingGameId: number | null;
}

function GameList({ games, loading, onSelect, onDelete, deletingGameId }: GameListProps) {
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
        <div key={g.id} className={`gh-card gh-card--${g.result}`}>
          <button type="button" className="gh-card__main" onClick={() => onSelect(g.id)}>
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
          <button
            type="button"
            className="gh-delete-btn gh-delete-btn--inline"
            disabled={deletingGameId === g.id}
            onClick={() => onDelete(g)}
          >
            {deletingGameId === g.id ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Replay view ──────────────────────────────────────────────────────────────

// Small Helper to convert SVG path
function createEvalPath(scores: (number | null)[], width: number, height: number, filledOptions: { type: 'white' | 'black' | 'line' }) {
  if (scores.length <= 1) return '';
  const stepX = width / (scores.length - 1);
  const midY = height / 2;
  
  let path = `M0,${midY}`;
  scores.forEach((s, i) => {
    let y = midY;
    if (s !== null) {
      // clamp score between -1000 and 1000 cp
      const clamped = Math.max(-1000, Math.min(1000, s));
      // map -1000..1000 to height..0 (higher score is White advantage, closer to 0)
      y = midY - (clamped / 1000) * midY;
    }
    path += ` L${i * stepX},${y}`;
  });

  if (filledOptions.type === 'white') {
    return `${path} L${width},${midY} L0,${midY} Z`;
  } else if (filledOptions.type === 'black') {
    return `${path} L${width},${midY} L0,${midY} Z`;
  }
  return path;
}

function EvalGraph({ scores, currentStep, onSelect }: { scores: (number | null)[], currentStep: number, onSelect: (step: number) => void }) {
  const width = 100;
  const height = 40;
  const midY = height / 2;
  const linePath = useMemo(() => createEvalPath(scores, width, height, { type: 'line' }), [scores]);
  const fillPath = useMemo(() => createEvalPath(scores, width, height, { type: 'white' }), [scores]);
  
  const stepX = scores.length > 1 ? width / (scores.length - 1) : 0;
  const cursorX = currentStep * stepX;

  return (
    <div className="gh-eval-graph-container" onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = clickX / rect.width;
      const step = Math.round(pct * (scores.length - 1));
      onSelect(Math.max(0, Math.min(scores.length - 1, step)));
    }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="gh-eval-svg">
        <rect x="0" y="0" width={width} height={midY} fill="rgba(255,255,255,0.05)" />
        <rect x="0" y={midY} width={width} height={midY} fill="rgba(0,0,0,0.15)" />
        
        {/* fill path covering advantages */}
        {fillPath && (
          <clipPath id="adv-clip">
            <path d={fillPath} />
          </clipPath>
        )}
        
        {fillPath && (
          <g clipPath="url(#adv-clip)">
            {/* White advantage fill */}
            <rect x="0" y="0" width={width} height={midY} fill="rgba(255,255,255,0.8)" />
            {/* Black advantage fill */}
            <rect x="0" y={midY} width={width} height={midY} fill="rgba(0,0,0,0.8)" />
          </g>
        )}
        
        {/* stroke path */}
        {linePath && (
          <path d={linePath} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" strokeLinejoin="round" />
        )}
        
        {/* zero line */}
        <line x1="0" y1={midY} x2={width} y2={midY} stroke="rgba(150,150,150,0.2)" strokeWidth="0.5" />
        
        {/* current step cursor */}
        <line x1={cursorX} y1="0" x2={cursorX} y2={height} stroke="#ff5555" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

interface GameReplayProps {
  game: GameRecord;
  onBack: () => void;
  onDelete: (game: GameRecord) => void;
  deletingGameId: number | null;
}

function GameReplay({ game, onBack, onDelete, deletingGameId }: GameReplayProps) {
  const moves = useMemo(() => game.moves ?? [], [game.moves]);
  const positions = useMemo(() => buildReplayPositions(moves), [moves]);
  const [step, setStep] = useState(moves.length);
  const [evals, setEvals] = useState<(number | null)[]>(new Array(moves.length + 1).fill(null));
  const [isAnalyzingGame, setIsAnalyzingGame] = useState(false);
  const [analyzedCount, setAnalyzedCount] = useState(0);

  const [isAnalyzingMove, setIsAnalyzingMove] = useState(false);
  const [analysisEntries, setAnalysisEntries] = useState<Record<number, PositionAnalysis>>({});
  const analysisCache = useRef<Map<number, PositionAnalysis>>(new Map());
  const pendingAnalysis = useRef<Map<number, Promise<PositionAnalysis | null>>>(new Map());
  const moveListRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((target: number) => {
    setStep(Math.max(0, Math.min(moves.length, target)));
  }, [moves.length]);



  const storeAnalysis = useCallback((targetStep: number, analysis: PositionAnalysis) => {
    analysisCache.current.set(targetStep, analysis);
    setAnalysisEntries((prev) => ({ ...prev, [targetStep]: analysis }));
    setEvals((prev) => {
      if (prev[targetStep] === analysis.score) return prev;
      const next = [...prev];
      next[targetStep] = analysis.score;
      return next;
    });
  }, []);

  const ensureAnalysis = useCallback(async (targetStep: number, depth = 10, multiPv = 3): Promise<PositionAnalysis | null> => {
    const cached = analysisCache.current.get(targetStep);
    if (cached) return cached;

    const existingRequest = pendingAnalysis.current.get(targetStep);
    if (existingRequest) return existingRequest;

    const position = positions[targetStep];
    if (!position) return null;

    const request = getAnalysis(position.fen, depth, multiPv)
      .then((result) => {
        if (!result) return null;
        const next = buildPositionAnalysis(position.fen, result);
        storeAnalysis(targetStep, next);
        return next;
      })
      .finally(() => {
        pendingAnalysis.current.delete(targetStep);
      });

    pendingAnalysis.current.set(targetStep, request);
    return request;
  }, [positions, storeAnalysis]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept if focus is in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
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

  const currentPosition = positions[step] ?? positions[0]!;
  const { board, lastMove, kingInCheck } = currentPosition;
  const isFlipped = game.player_color === 'b';
  const currentAnalysis = analysisEntries[step] ?? null;

  useEffect(() => {
    let active = true;
    const needsCurrent = !analysisCache.current.has(step);
    setIsAnalyzingMove(needsCurrent);

    void Promise.all([
      ensureAnalysis(step, 12, 3),
      step > 0 ? ensureAnalysis(step - 1, 10, 3) : Promise.resolve(null),
    ]).finally(() => {
      if (active) setIsAnalyzingMove(false);
    });

    return () => { active = false; };
  }, [ensureAnalysis, step]);

  const runFullAnalysis = async () => {
    if (isAnalyzingGame) return;
    setIsAnalyzingGame(true);
    setAnalyzedCount(0);

    for (let i = 0; i <= moves.length; i++) {
      if (analysisCache.current.has(i)) {
        setAnalyzedCount(c => c + 1);
        continue;
      }
      await ensureAnalysis(i, 10, 3);
      setAnalyzedCount(c => c + 1);
    }
    setIsAnalyzingGame(false);
  };

  const movePairs: { number: number; white: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ number: i / 2 + 1, white: moves[i]!, black: moves[i + 1] });
  }

  const moveReviews = useMemo(() => {
    const reviews: Record<number, MoveReview> = {};

    for (let moveIndex = 0; moveIndex < moves.length; moveIndex += 1) {
      const before = analysisEntries[moveIndex];
      const after = analysisEntries[moveIndex + 1];
      if (!before || !after) continue;

      const review = classifyMoveReview(moveIndex, moves[moveIndex]!, before, after);
      if (review) {
        reviews[moveIndex + 1] = review;
      }
    }

    return reviews;
  }, [analysisEntries, moves]);

  const selectedMoveReview = step > 0 ? moveReviews[step] ?? null : null;
  const selectedMoveSan = step > 0 ? moves[step - 1] ?? null : null;

  return (
    <div className="gh-replay">
      <div className="gh-replay__header">
        <button className="gh-back-btn" onClick={onBack}>← Games</button>
        <div className="gh-replay__meta">
          <span className={`gh-badge gh-badge--${game.result}`}>{resultLabel(game.result)}</span>
          <span>🤖 {game.bot_rating} ELO</span>
          <span>{colorLabel(game.player_color)}</span>
          <span className="gh-card__date">{formatDate(game.played_at)}</span>
          <button
            type="button"
            className="gh-delete-btn"
            disabled={deletingGameId === game.id}
            onClick={() => onDelete(game)}
          >
            {deletingGameId === game.id ? 'Deleting…' : 'Delete Game'}
          </button>
        </div>
      </div>

      <div className="gh-replay__graph-area">
        <EvalGraph scores={evals} currentStep={step} onSelect={goTo} />
        
        {!isAnalyzingGame && evals.includes(null) && (
          <button className="gh-analyze-btn" onClick={runFullAnalysis}>
            🧠 Analyze Full Game
          </button>
        )}
        {isAnalyzingGame && (
            <div className="gh-analyze-progress">
              <div className="gh-analyze-progress-bar" style={{ width: `${(analyzedCount / (moves.length + 1)) * 100}%` }} />
              <span>Analyzing... {analyzedCount}/{moves.length + 1}</span>
            </div>
        )}
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

        <div className="gh-replay__sidebar">
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
                  <span className="gh-move__main">{pair.white}</span>
                  {moveReviews[whiteIdx] && (
                    <span className={`gh-move-tag gh-move-tag--${moveReviews[whiteIdx]!.tone}`}>
                      {moveReviews[whiteIdx]!.label}
                    </span>
                  )}
                </button>
                {pair.black && (
                  <button
                    className={`gh-move ${step === blackIdx ? 'gh-move--active' : ''}`}
                    onClick={() => goTo(blackIdx)}
                  >
                    <span className="gh-move__main">{pair.black}</span>
                    {moveReviews[blackIdx] && (
                      <span className={`gh-move-tag gh-move-tag--${moveReviews[blackIdx]!.tone}`}>
                        {moveReviews[blackIdx]!.label}
                      </span>
                    )}
                  </button>
                )}
              </div>
            );
          })}
          {moves.length === 0 && <p className="gh-empty-moves">No moves recorded.</p>}
          </div>
        </div>
      </div>

      <div className="gh-analysis-panel">
        <h4 className="gh-analysis-panel__title">Engine Analysis</h4>
        {isAnalyzingMove ? (
          <div className="gh-analysis-loading">...</div>
        ) : currentAnalysis ? (
          <div className="gh-analysis-content">
            {selectedMoveReview && selectedMoveSan && (
              <div className="gh-review-summary">
                <span className={`gh-review-pill gh-review-pill--${selectedMoveReview.tone}`}>
                  {selectedMoveReview.label}
                </span>
                <p className="gh-review-summary__text">
                  {selectedMoveReview.tone === 'best'
                    ? `${selectedMoveSan} matches the engine's top choice.`
                    : `${selectedMoveSan} costs about ${formatPawnLoss(selectedMoveReview.loss)}.${selectedMoveReview.bestMoveSan ? ` Best was ${selectedMoveReview.bestMoveSan}.` : ''}`}
                </p>
              </div>
            )}
            <div className="gh-analysis-eval">
              {formatScore(currentAnalysis.score, currentAnalysis.mate)}
            </div>
            <div className="gh-analysis-lines">
              {currentAnalysis.lines.map((line, idx) => {
                const firstMove = line.sanLine[0] ?? '...';
                return (
                  <div key={idx} className="gh-analysis-line">
                    <span className="gh-al-score">{formatScore(line.score, line.mate)}</span>
                    <span className="gh-al-move">
                      <strong>{firstMove}</strong>
                      <span className="gh-al-rest">
                        {line.sanLine.slice(1).join(' ')}
                        {line.sanLine.length >= 4 ? '...' : ''}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
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
  const [deletingGameId, setDeletingGameId] = useState<number | null>(null);

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

  const handleDelete = useCallback(async (game: GameRecord) => {
    const confirmed = window.confirm(`Delete the game from ${formatDate(game.played_at)} at ${formatTime(game.played_at)}?`);
    if (!confirmed) return;

    try {
      setDeletingGameId(game.id);
      await deleteGame(game.id);
      setGames((prev) => prev.filter((item) => item.id !== game.id));
      setSelectedGame((prev) => (prev?.id === game.id ? null : prev));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to delete game');
    } finally {
      setDeletingGameId(null);
    }
  }, []);

  const stats = useMemo(() => (games.length > 0 ? computeStats(games) : null), [games]);

  if (loadingGame) return <div className="gh-loading">Loading game…</div>;

  if (selectedGame) {
    return (
      <GameReplay
        key={selectedGame.id}
        game={selectedGame}
        onBack={() => setSelectedGame(null)}
        onDelete={handleDelete}
        deletingGameId={deletingGameId}
      />
    );
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
      <GameList
        games={games}
        loading={loading}
        onSelect={handleSelect}
        onDelete={handleDelete}
        deletingGameId={deletingGameId}
      />
    </div>
  );
}
