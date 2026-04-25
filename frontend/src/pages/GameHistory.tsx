import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Board from '../components/Board';
import {
  getGames,
  getGame,
  getAnalysis,
  getAnalysisOrThrow,
  deleteGame,
  updateGameMoveNotes,
} from '../engine/eval';
import type { GameRecord, EngineAnalysis } from '../engine/eval';
import { ChessGame } from '../engine/ChessGame';
import type { Board as BoardData, Square } from '../engine/types';
import './GameHistory.css';

// ─── helpers ──────────────────────────────────────────────────────────────────

type TurnColor = 'w' | 'b';
type StepChangeSource = 'controls' | 'move-list' | 'keyboard' | 'graph';
type ReviewBadgeTone = Extract<MoveCategory, 'missed' | 'mistake' | 'blunder'>;

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

type MoveCategory = 'best' | 'good' | 'missed' | 'mistake' | 'blunder';

interface MoveReview {
  category: MoveCategory;
  label: 'Best' | 'Good' | 'Missed opportunity' | 'Mistake' | 'Blunder';
  tone: MoveCategory;
  loss: number;
  bestMoveSan: string | null;
  accuracy: number;
}

interface PlayerAnalysisSummary {
  color: TurnColor;
  label: string;
  accuracy: number | null;
  moves: number;
  categories: Record<MoveCategory, number>;
  averageMoveTimeMs: number | null;
}

interface ReplayPosition {
  board: BoardData;
  lastMove: { from: Square; to: Square } | null;
  kingInCheck: Square | null;
  fen: string;
}

const OVERVIEW_DEPTH = 6;
const OVERVIEW_MULTI_PV = 1;
const PREMOVE_DETAIL_DEPTH = 12;
const PREMOVE_DETAIL_MULTI_PV = 3;
const POSTMOVE_DETAIL_DEPTH = 10;
const POSTMOVE_DETAIL_MULTI_PV = 2;
const OVERVIEW_RETRY_DELAY_MS = 1000;
const OVERVIEW_STEP_DELAY_MS = 100;
const NOTE_SAVE_DEBOUNCE_MS = 600;

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

function formatMoveDuration(ms: number): string {
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function normalizeMoveNotes(moveNotes: string[] | undefined, totalMoves: number): string[] {
  return Array.from({ length: totalMoves }, (_, index) => (
    typeof moveNotes?.[index] === 'string' ? moveNotes[index]! : ''
  ));
}

function hasMoveNote(note: string | null | undefined): boolean {
  return (note ?? '').trim().length > 0;
}

function detailBeforeKey(step: number): string {
  return `before:${step}`;
}

function detailAfterKey(step: number): string {
  return `after:${step}`;
}

function readErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function formatMoveReference(step: number, san: string): string {
  const moveNumber = Math.ceil(step / 2);
  return step % 2 === 1 ? `${moveNumber}.${san}` : `${moveNumber}...${san}`;
}

function formatSanSummary(sanLine: string[]): string {
  if (sanLine.length === 0) {
    return '...';
  }
  const visible = sanLine.slice(0, 6);
  return visible.length < sanLine.length ? `${visible.join(' ')} ...` : visible.join(' ');
}

function badgeTextForReview(review: MoveReview): string | null {
  if (review.tone === 'missed') return '?!';
  if (review.tone === 'mistake') return '?';
  if (review.tone === 'blunder') return '??';
  return null;
}

function badgeToneForReview(review: MoveReview): ReviewBadgeTone | null {
  if (review.tone === 'missed' || review.tone === 'mistake' || review.tone === 'blunder') {
    return review.tone;
  }
  return null;
}

function toSanLine(fen: string, pv: string[], maxMoves = 6): string[] {
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

function moveAccuracy(loss: number): number {
  const normalized = Math.max(0, loss);
  return Math.max(0, Math.min(100, Math.round((100 - normalized / 4) * 10) / 10));
}

function classifyMoveReview(
  moveIndex: number,
  playedSan: string,
  before: PositionAnalysis,
  after: PositionAnalysis,
): MoveReview {
  const mover: TurnColor = moveIndex % 2 === 0 ? 'w' : 'b';
  const bestMoveSan = before.bestMoveSan;
  const beforeScore = scoreForMover(before.score, mover);
  const afterScore = scoreForMover(after.score, mover);
  const loss = Math.max(0, beforeScore - afterScore);
  const accuracy = bestMoveSan && normalizeSan(bestMoveSan) === normalizeSan(playedSan)
    ? 100
    : moveAccuracy(loss);

  if (bestMoveSan && normalizeSan(bestMoveSan) === normalizeSan(playedSan)) {
    return { category: 'best', label: 'Best', tone: 'best', loss, bestMoveSan, accuracy };
  }

  if (loss >= 250) {
    return { category: 'blunder', label: 'Blunder', tone: 'blunder', loss, bestMoveSan, accuracy };
  }

  if (loss >= 120) {
    return { category: 'mistake', label: 'Mistake', tone: 'mistake', loss, bestMoveSan, accuracy };
  }

  if (loss >= 70 && beforeScore >= 125) {
    return { category: 'missed', label: 'Missed opportunity', tone: 'missed', loss, bestMoveSan, accuracy };
  }

  return { category: 'good', label: 'Good', tone: 'good', loss, bestMoveSan, accuracy };
}

function summarizePlayers(moves: string[], moveTimes: number[], analysisEntries: Record<number, PositionAnalysis>): PlayerAnalysisSummary[] | null {
  const seed = (): Record<MoveCategory, number> => ({
    best: 0,
    good: 0,
    missed: 0,
    mistake: 0,
    blunder: 0,
  });

  const summaries: Record<TurnColor, PlayerAnalysisSummary & { accuracyTotal: number; moveTimeTotalMs: number }> = {
    w: { color: 'w', label: 'White', accuracy: null, moves: 0, categories: seed(), accuracyTotal: 0, moveTimeTotalMs: 0, averageMoveTimeMs: null },
    b: { color: 'b', label: 'Black', accuracy: null, moves: 0, categories: seed(), accuracyTotal: 0, moveTimeTotalMs: 0, averageMoveTimeMs: null },
  };

  for (let moveIndex = 0; moveIndex < moves.length; moveIndex += 1) {
    const before = analysisEntries[moveIndex];
    const after = analysisEntries[moveIndex + 1];
    if (!before || !after) return null;

    const mover: TurnColor = moveIndex % 2 === 0 ? 'w' : 'b';
    const review = classifyMoveReview(moveIndex, moves[moveIndex]!, before, after);
    const summary = summaries[mover];
    summary.moves += 1;
    summary.categories[review.category] += 1;
    summary.accuracyTotal += review.accuracy;
    summary.moveTimeTotalMs += moveTimes[moveIndex] ?? 0;
  }

  return (['w', 'b'] as const).map((color) => {
    const summary = summaries[color];
    return {
      color,
      label: summary.label,
      moves: summary.moves,
      categories: summary.categories,
      accuracy: summary.moves > 0 ? Math.round((summary.accuracyTotal / summary.moves) * 10) / 10 : null,
      averageMoveTimeMs: summary.moves > 0 ? Math.round(summary.moveTimeTotalMs / summary.moves) : null,
    };
  });
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
  const moveTimes = useMemo(() => game.move_times ?? [], [game.move_times]);
  const positions = useMemo(() => buildReplayPositions(moves), [moves]);
  const [step, setStep] = useState(moves.length);
  const [evals, setEvals] = useState<(number | null)[]>(new Array(moves.length + 1).fill(null));
  const [isAnalyzingGame, setIsAnalyzingGame] = useState(false);
  const [analyzedCount, setAnalyzedCount] = useState(0);
  const [isAnalyzingMove, setIsAnalyzingMove] = useState(false);
  const [overviewEntries, setOverviewEntries] = useState<Record<number, PositionAnalysis>>({});
  const overviewCache = useRef<Map<number, PositionAnalysis>>(new Map());
  const pendingOverview = useRef<Map<number, Promise<PositionAnalysis | null>>>(new Map());
  const [detailEntries, setDetailEntries] = useState<Record<string, PositionAnalysis>>({});
  const detailCache = useRef<Map<string, PositionAnalysis>>(new Map());
  const pendingDetail = useRef<Map<string, Promise<PositionAnalysis | null>>>(new Map());
  const analysisRunId = useRef(0);
  const moveListRef = useRef<HTMLDivElement>(null);
  const stepScrollSource = useRef<StepChangeSource>('controls');
  const [savedMoveNotes, setSavedMoveNotes] = useState<string[]>(() => normalizeMoveNotes(game.move_notes, moves.length));
  const [draftMoveNotes, setDraftMoveNotes] = useState<string[]>(() => normalizeMoveNotes(game.move_notes, moves.length));
  const [notesSaveError, setNotesSaveError] = useState<string | null>(null);
  const savedMoveNotesRef = useRef(savedMoveNotes);
  const draftMoveNotesRef = useRef(draftMoveNotes);
  const noteSaveInFlight = useRef(false);
  const noteSaveQueued = useRef(false);

  const goTo = useCallback((target: number, source: StepChangeSource = 'controls') => {
    stepScrollSource.current = source;
    setStep(Math.max(0, Math.min(moves.length, target)));
  }, [moves.length]);

  const storeOverviewAnalysis = useCallback((targetStep: number, analysis: PositionAnalysis) => {
    overviewCache.current.set(targetStep, analysis);
    setOverviewEntries((prev) => (
      prev[targetStep] === analysis ? prev : { ...prev, [targetStep]: analysis }
    ));
    setEvals((prev) => {
      if (prev[targetStep] === analysis.score) return prev;
      const next = [...prev];
      next[targetStep] = analysis.score;
      return next;
    });
  }, []);

  const storeDetailAnalysis = useCallback((cacheKey: string, analysis: PositionAnalysis) => {
    detailCache.current.set(cacheKey, analysis);
    setDetailEntries((prev) => (
      prev[cacheKey] === analysis ? prev : { ...prev, [cacheKey]: analysis }
    ));
  }, []);

  const ensureOverviewAnalysis = useCallback(async (targetStep: number): Promise<PositionAnalysis | null> => {
    const cached = overviewCache.current.get(targetStep);
    if (cached) return cached;

    const existingRequest = pendingOverview.current.get(targetStep);
    if (existingRequest) return existingRequest;

    const position = positions[targetStep];
    if (!position) return null;

    const request = (async () => {
      const fetchOnce = async () => {
        const result = await getAnalysisOrThrow(position.fen, OVERVIEW_DEPTH, OVERVIEW_MULTI_PV);
        const next = buildPositionAnalysis(position.fen, result);
        storeOverviewAnalysis(targetStep, next);
        return next;
      };

      try {
        return await fetchOnce();
      } catch (error) {
        if (readErrorStatus(error) === 429) {
          await delay(OVERVIEW_RETRY_DELAY_MS);
          try {
            return await fetchOnce();
          } catch (retryError) {
            console.error('Error fetching overview engine analysis:', retryError);
            return null;
          }
        }
        console.error('Error fetching overview engine analysis:', error);
        return null;
      } finally {
        pendingOverview.current.delete(targetStep);
      }
    })();

    pendingOverview.current.set(targetStep, request);
    return request;
  }, [positions, storeOverviewAnalysis]);

  const ensureDetailAnalysis = useCallback(async (
    targetStep: number,
    depth: number,
    multiPv: number,
    cacheKey: string,
  ): Promise<PositionAnalysis | null> => {
    const cached = detailCache.current.get(cacheKey);
    if (cached) return cached;

    const existingRequest = pendingDetail.current.get(cacheKey);
    if (existingRequest) return existingRequest;

    const position = positions[targetStep];
    if (!position) return null;

    const request = getAnalysis(position.fen, depth, multiPv)
      .then((result) => {
        if (!result) return null;
        const next = buildPositionAnalysis(position.fen, result);
        storeDetailAnalysis(cacheKey, next);
        return next;
      })
      .finally(() => {
        pendingDetail.current.delete(cacheKey);
      });

    pendingDetail.current.set(cacheKey, request);
    return request;
  }, [positions, storeDetailAnalysis]);

  useEffect(() => () => {
    analysisRunId.current += 1;
  }, []);

  useEffect(() => {
    savedMoveNotesRef.current = savedMoveNotes;
  }, [savedMoveNotes]);

  useEffect(() => {
    draftMoveNotesRef.current = draftMoveNotes;
  }, [draftMoveNotes]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goTo(step - 1, 'keyboard'); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goTo(step + 1, 'keyboard'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, goTo]);

  useEffect(() => {
    const source = stepScrollSource.current;
    stepScrollSource.current = 'controls';
    if (source !== 'move-list' || !moveListRef.current) return;

    if (!moveListRef.current) return;
    const container = moveListRef.current;
    const active = container.querySelector('.gh-move--active');
    if (!(active instanceof HTMLElement)) {
      return;
    }

    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;

    if (top < visibleTop) {
      container.scrollTop = Math.max(0, top - 12);
    } else if (bottom > visibleBottom) {
      container.scrollTop = bottom - container.clientHeight + 12;
    }
  }, [step]);

  const currentPosition = positions[step] ?? positions[0]!;
  const { board, lastMove, kingInCheck } = currentPosition;
  const isFlipped = game.player_color === 'b';
  const currentAnalysis = detailEntries[detailAfterKey(step)] ?? null;
  const currentBeforeAnalysis = step > 0 ? detailEntries[detailBeforeKey(step - 1)] ?? null : null;

  useEffect(() => {
    let active = true;
    const needsCurrent = !detailCache.current.has(detailAfterKey(step));
    const needsBefore = step > 0 && !detailCache.current.has(detailBeforeKey(step - 1));
    setIsAnalyzingMove(needsCurrent || needsBefore);

    void Promise.all([
      ensureDetailAnalysis(step, POSTMOVE_DETAIL_DEPTH, POSTMOVE_DETAIL_MULTI_PV, detailAfterKey(step)),
      step > 0
        ? ensureDetailAnalysis(step - 1, PREMOVE_DETAIL_DEPTH, PREMOVE_DETAIL_MULTI_PV, detailBeforeKey(step - 1))
        : Promise.resolve(null),
      ensureOverviewAnalysis(step),
      step > 0 ? ensureOverviewAnalysis(step - 1) : Promise.resolve(null),
    ]).finally(() => {
      if (active) setIsAnalyzingMove(false);
    });

    return () => { active = false; };
  }, [ensureDetailAnalysis, ensureOverviewAnalysis, step]);

  const saveMoveNotes = useCallback(async () => {
    if (noteSaveInFlight.current) {
      noteSaveQueued.current = true;
      return;
    }

    const snapshot = [...draftMoveNotesRef.current];
    if (snapshot.every((note, index) => note === savedMoveNotesRef.current[index])) {
      setNotesSaveError(null);
      return;
    }

    noteSaveInFlight.current = true;
    setNotesSaveError(null);

    try {
      const nextNotes = normalizeMoveNotes(await updateGameMoveNotes(game.id, snapshot), moves.length);
      setSavedMoveNotes(nextNotes);
    } catch (error) {
      setNotesSaveError(error instanceof Error ? error.message : 'Failed to save notes');
    } finally {
      noteSaveInFlight.current = false;
      if (noteSaveQueued.current) {
        noteSaveQueued.current = false;
        void saveMoveNotes();
      }
    }
  }, [game.id, moves.length]);

  const hasDirtyNotes = useMemo(
    () => draftMoveNotes.some((note, index) => note !== savedMoveNotes[index]),
    [draftMoveNotes, savedMoveNotes],
  );

  useEffect(() => {
    if (!hasDirtyNotes) return;

    const timer = window.setTimeout(() => {
      void saveMoveNotes();
    }, NOTE_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [draftMoveNotes, hasDirtyNotes, saveMoveNotes]);

  const runFullAnalysis = async () => {
    if (isAnalyzingGame) return;
    const runId = analysisRunId.current + 1;
    analysisRunId.current = runId;
    setIsAnalyzingGame(true);
    setAnalyzedCount(0);

    try {
      let completed = 0;
      for (let targetStep = 0; targetStep <= moves.length; targetStep += 1) {
        await ensureOverviewAnalysis(targetStep);

        if (analysisRunId.current !== runId) {
          return;
        }

        completed += 1;
        setAnalyzedCount(completed);

        if (targetStep < moves.length) {
          await delay(OVERVIEW_STEP_DELAY_MS);
        }
      }
    } finally {
      if (analysisRunId.current === runId) {
        setIsAnalyzingGame(false);
      }
    }
  };

  const movePairs: { number: number; white: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    movePairs.push({ number: i / 2 + 1, white: moves[i]!, black: moves[i + 1] });
  }

  const moveReviews = useMemo(() => {
    const reviews: Record<number, MoveReview> = {};

    for (let moveIndex = 0; moveIndex < moves.length; moveIndex += 1) {
      const before = overviewEntries[moveIndex];
      const after = overviewEntries[moveIndex + 1];
      if (!before || !after) continue;

      const review = classifyMoveReview(moveIndex, moves[moveIndex]!, before, after);
      if (review.category !== 'good') {
        reviews[moveIndex + 1] = review;
      }
    }

    return reviews;
  }, [moves, overviewEntries]);

  const playerSummaries = useMemo(
    () => summarizePlayers(moves, moveTimes, overviewEntries),
    [moveTimes, moves, overviewEntries],
  );

  const selectedMoveReview = step > 0 ? moveReviews[step] ?? null : null;
  const selectedMoveSan = step > 0 ? moves[step - 1] ?? null : null;
  const selectedMoveReference = selectedMoveSan ? formatMoveReference(step, selectedMoveSan) : null;
  const currentNote = step > 0 ? draftMoveNotes[step - 1] ?? '' : '';
  const currentNoteDirty = step > 0 && currentNote !== savedMoveNotes[step - 1];
  const noteSaveState = step > 0
    ? notesSaveError && currentNoteDirty
      ? 'error'
      : currentNoteDirty
        ? 'saving'
        : 'saved'
    : 'saved';
  const selectedSquareBadges = useMemo(() => {
    if (!lastMove || !selectedMoveReview) return {};
    const tone = badgeToneForReview(selectedMoveReview);
    const text = badgeTextForReview(selectedMoveReview);
    if (!tone || !text) return {};
    return { [lastMove.to]: { text, tone } };
  }, [lastMove, selectedMoveReview]) as Partial<Record<Square, { text: string; tone: ReviewBadgeTone }>>;
  const bestLine = currentBeforeAnalysis?.lines[0] ?? null;
  const playedLine = currentAnalysis?.lines[0] ?? null;

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
        <EvalGraph scores={evals} currentStep={step} onSelect={(targetStep) => goTo(targetStep, 'graph')} />
        
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

      {playerSummaries ? (
        <div className="gh-analysis-summary">
          {playerSummaries.map((summary) => (
            <section
              key={summary.color}
              className="gh-analysis-summary__card"
              data-testid={`gh-summary-${summary.color}`}
            >
              <div className="gh-analysis-summary__top">
                <div>
                  <h4 className="gh-analysis-summary__title">{summary.label} Accuracy</h4>
                  <p className="gh-analysis-summary__meta">{summary.moves} analyzed {summary.moves === 1 ? 'move' : 'moves'}</p>
                  {summary.averageMoveTimeMs !== null && (
                    <p className="gh-analysis-summary__time">Avg move time {formatMoveDuration(summary.averageMoveTimeMs)}</p>
                  )}
                </div>
                <div className="gh-analysis-summary__accuracy">
                  {summary.accuracy === null ? '—' : `${summary.accuracy.toFixed(1)}%`}
                </div>
              </div>
              <div className="gh-analysis-summary__grid">
                <div className="gh-analysis-stat gh-analysis-stat--best">
                  <span className="gh-analysis-stat__label">Best</span>
                  <strong>{summary.categories.best}</strong>
                </div>
                <div className="gh-analysis-stat gh-analysis-stat--good">
                  <span className="gh-analysis-stat__label">Good</span>
                  <strong>{summary.categories.good}</strong>
                </div>
                <div className="gh-analysis-stat gh-analysis-stat--missed">
                  <span className="gh-analysis-stat__label">Missed</span>
                  <strong>{summary.categories.missed}</strong>
                </div>
                <div className="gh-analysis-stat gh-analysis-stat--mistake">
                  <span className="gh-analysis-stat__label">Mistake</span>
                  <strong>{summary.categories.mistake}</strong>
                </div>
                <div className="gh-analysis-stat gh-analysis-stat--blunder">
                  <span className="gh-analysis-stat__label">Blunder</span>
                  <strong>{summary.categories.blunder}</strong>
                </div>
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="gh-analysis-summary gh-analysis-summary--pending">
          <div className="gh-analysis-summary__empty">
            Analyze the full game to see per-player accuracy and move-category totals.
          </div>
        </div>
      )}

      <div className="gh-replay__body">
        <div className="gh-replay__board-wrap">
          <Board
            board={board}
            selectedSquare={null}
            legalMoves={[]}
            lastMove={lastMove}
            kingInCheck={kingInCheck}
            squareBadges={selectedSquareBadges}
            isFlipped={isFlipped}
            onSquareClick={() => {/* read-only */}}
          />
          <div className="gh-controls" role="group" aria-label="Replay controls">
            <button className="gh-ctrl-btn gh-ctrl-btn--edge" onClick={() => goTo(0, 'controls')} disabled={step === 0} title="Start" aria-label="Go to start">
              <span className="gh-ctrl-btn__icon">⏮</span>
              <span className="gh-ctrl-btn__label">Start</span>
            </button>
            <button className="gh-ctrl-btn gh-ctrl-btn--primary" onClick={() => goTo(step - 1, 'controls')} disabled={step === 0} title="Previous (←)" aria-label="Previous move">
              <span className="gh-ctrl-btn__icon">◀</span>
              <span className="gh-ctrl-btn__label">Prev</span>
            </button>
            <span className="gh-ctrl-counter" aria-live="polite">Move {step} of {moves.length}</span>
            <button className="gh-ctrl-btn gh-ctrl-btn--primary" onClick={() => goTo(step + 1, 'controls')} disabled={step === moves.length} title="Next (→)" aria-label="Next move">
              <span className="gh-ctrl-btn__label">Next</span>
              <span className="gh-ctrl-btn__icon">▶</span>
            </button>
            <button className="gh-ctrl-btn gh-ctrl-btn--edge" onClick={() => goTo(moves.length, 'controls')} disabled={step === moves.length} title="End" aria-label="Go to end">
              <span className="gh-ctrl-btn__label">End</span>
              <span className="gh-ctrl-btn__icon">⏭</span>
            </button>
          </div>
          <p className="gh-controls__hint">Use the buttons or your keyboard arrows to navigate</p>
        </div>

        <div className="gh-replay__sidebar">
          <div className="gh-replay__sidebar-head">
            <div>
              <h4 className="gh-replay__sidebar-title">Moves</h4>
              <p className="gh-replay__sidebar-subtitle">Tap any move to jump to that position</p>
            </div>
            <span className="gh-replay__sidebar-step">Move {step} / {moves.length}</span>
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
                  onClick={() => goTo(whiteIdx, 'move-list')}
                >
                  <span className="gh-move__main">{pair.white}</span>
                  <span className="gh-move__meta">
                      {typeof moveTimes[whiteIdx - 1] === 'number' && (
                        <span className="gh-move-time">{formatMoveDuration(moveTimes[whiteIdx - 1]!)}</span>
                      )}
                      {hasMoveNote(draftMoveNotes[whiteIdx - 1]) && (
                        <span className="gh-move-note-indicator" aria-label="Saved note">•</span>
                      )}
                      {moveReviews[whiteIdx] && (
                        <span className={`gh-move-tag gh-move-tag--${moveReviews[whiteIdx]!.tone}`}>
                          {moveReviews[whiteIdx]!.label}
                        </span>
                      )}
                  </span>
                </button>
                {pair.black && (
                  <button
                    className={`gh-move ${step === blackIdx ? 'gh-move--active' : ''}`}
                    onClick={() => goTo(blackIdx, 'move-list')}
                  >
                    <span className="gh-move__main">{pair.black}</span>
                    <span className="gh-move__meta">
                      {typeof moveTimes[blackIdx - 1] === 'number' && (
                        <span className="gh-move-time">{formatMoveDuration(moveTimes[blackIdx - 1]!)}</span>
                      )}
                      {hasMoveNote(draftMoveNotes[blackIdx - 1]) && (
                        <span className="gh-move-note-indicator" aria-label="Saved note">•</span>
                      )}
                      {moveReviews[blackIdx] && (
                        <span className={`gh-move-tag gh-move-tag--${moveReviews[blackIdx]!.tone}`}>
                          {moveReviews[blackIdx]!.label}
                        </span>
                      )}
                    </span>
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

          {selectedMoveReview && selectedMoveSan && currentAnalysis && bestLine && playedLine && (
            <div className="gh-line-compare">
              <div className="gh-line-compare__card gh-line-compare__card--best">
                <div className="gh-line-compare__head">
                  <span className="gh-line-compare__label">Best line</span>
                  <span className="gh-line-compare__score">{formatScore(bestLine.score, bestLine.mate)}</span>
                </div>
                <p className="gh-line-compare__moves">{formatSanSummary(bestLine.sanLine)}</p>
              </div>
              <div className="gh-line-compare__card gh-line-compare__card--played">
                <div className="gh-line-compare__head">
                  <span className="gh-line-compare__label">Played line</span>
                  <span className="gh-line-compare__score">{formatScore(currentAnalysis.score, currentAnalysis.mate)}</span>
                </div>
                <p className="gh-line-compare__moves">
                  {formatSanSummary([selectedMoveSan, ...playedLine.sanLine])}
                </p>
              </div>
            </div>
          )}

          {step > 0 && selectedMoveReference && (
            <div className="gh-move-note">
              <div className="gh-move-note__head">
                <label className="gh-move-note__title" htmlFor={`gh-note-${game.id}`}>
                  Private note
                </label>
                <div className="gh-move-note__status">
                  <span className={`gh-move-note__state gh-move-note__state--${noteSaveState}`}>
                    {noteSaveState === 'error' ? 'Save failed' : noteSaveState === 'saving' ? 'Saving…' : 'Saved'}
                  </span>
                  {noteSaveState === 'error' && (
                    <button
                      type="button"
                      className="gh-move-note__retry"
                      onClick={() => void saveMoveNotes()}
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
              <textarea
                id={`gh-note-${game.id}`}
                className="gh-move-note__input"
                value={currentNote}
                maxLength={1000}
                placeholder={`Your note for ${selectedMoveReference}`}
                onChange={(event) => {
                  const value = event.target.value;
                  setNotesSaveError(null);
                  setDraftMoveNotes((prev) => {
                    const next = [...prev];
                    next[step - 1] = value;
                    return next;
                  });
                }}
              />
            </div>
          )}

          {isAnalyzingMove ? (
            <div className="gh-analysis-loading">Loading engine lines…</div>
          ) : currentAnalysis ? (
            <>
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
                          {line.sanLine.length >= 6 ? '...' : ''}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="gh-analysis-loading">Engine lines unavailable for this position.</div>
          )}
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
