import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import GameHistory from '../pages/GameHistory';
import { ChessGame } from '../engine/ChessGame';
import type { EngineAnalysis, GameRecord } from '../engine/eval';
import type { Square } from '../engine/types';

const evalMocks = vi.hoisted(() => ({
  getGames: vi.fn(),
  getGame: vi.fn(),
  getAnalysis: vi.fn(),
  getAnalysisOrThrow: vi.fn(),
  deleteGame: vi.fn(),
  updateGameMoveNotes: vi.fn(),
}));

vi.mock('../components/Board', () => ({
  default: ({ squareBadges = {} }: { squareBadges?: Record<string, { text: string }> }) => (
    <div data-testid="history-board">
      {Object.entries(squareBadges).map(([square, badge]) => (
        <div key={square} data-testid={`history-board-badge-${square}`}>
          {badge.text}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('../engine/eval', () => ({
  getGames: evalMocks.getGames,
  getGame: evalMocks.getGame,
  getAnalysis: evalMocks.getAnalysis,
  getAnalysisOrThrow: evalMocks.getAnalysisOrThrow,
  deleteGame: evalMocks.deleteGame,
  updateGameMoveNotes: evalMocks.updateGameMoveNotes,
}));

function buildFenSequence(moves: string[]) {
  const game = new ChessGame();
  const fens = [game.fen()];
  for (const move of moves) {
    game.makeSanMove(move);
    fens.push(game.fen());
  }
  return fens;
}

function firstLegalUci(fen: string): string {
  const game = new ChessGame(fen);
  const board = game.getBoard();
  const activeColor = game.turn();

  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      const piece = board[row]?.[col];
      if (!piece || piece.color !== activeColor) continue;

      const square = `${String.fromCharCode(97 + col)}${8 - row}`;
      const legalMoves = game.getLegalMoves(square as Square);
      if (legalMoves.length > 0) {
        return `${square}${legalMoves[0]}`;
      }
    }
  }

  throw new Error(`No legal move found for FEN: ${fen}`);
}

function makeAnalysis(fen: string, whiteScore: number, pv: string[] = [firstLegalUci(fen)]): EngineAnalysis {
  const activeColor = fen.split(' ')[1] === 'b' ? -1 : 1;
  const rawScore = whiteScore * activeColor;
  return {
    score: rawScore,
    mate: null,
    lines: [{ score: rawScore, mate: null, pv }],
  };
}

async function openReplay(summary: GameRecord, fullGame: GameRecord) {
  evalMocks.getGames.mockResolvedValue([summary]);
  evalMocks.getGame.mockResolvedValue(fullGame);
  evalMocks.deleteGame.mockResolvedValue(undefined);

  render(<GameHistory />);

  await waitFor(() => {
    expect(screen.getByText(new RegExp(`bot ${summary.bot_rating} elo`, 'i'))).toBeInTheDocument();
  });

  fireEvent.click(screen.getByText(new RegExp(`bot ${summary.bot_rating} elo`, 'i')));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: /analyze full game/i })).toBeInTheDocument();
  });
}

describe('GameHistory replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('analyzes long games end-to-end and retries overview analysis after 429s', async () => {
    const moves = [
      'e4', 'e5',
      'Nf3', 'Nc6',
      'Bc4', 'Bc5',
      'c3', 'Nf6',
      'd3', 'd6',
      'O-O', 'O-O',
      'Re1', 'a6',
      'Bb3', 'Ba7',
      'h3', 'h6',
      'Nbd2', 'Re8',
      'Nf1', 'Be6',
    ];
    const fullGame: GameRecord = {
      id: 17,
      played_at: '2026-04-12T12:00:00.000Z',
      bot_rating: 1800,
      player_color: 'w',
      result: 'win',
      total_moves: moves.length,
      moves,
      move_times: Array.from({ length: moves.length }, (_, index) => 1400 + index * 100),
      move_notes: [],
    };
    const summary: GameRecord = {
      id: fullGame.id,
      played_at: fullGame.played_at,
      bot_rating: fullGame.bot_rating,
      player_color: fullGame.player_color,
      result: fullGame.result,
      total_moves: fullGame.total_moves,
    };
    const fens = buildFenSequence(moves);
    const retryFen = fens[12]!;
    const attemptCounts = new Map<string, number>();

    evalMocks.getAnalysis.mockImplementation(async (fen: string) => {
      const index = fens.indexOf(fen);
      return makeAnalysis(fen, index * 8);
    });

    evalMocks.getAnalysisOrThrow.mockImplementation(async (fen: string, depth: number, multiPv: number) => {
      expect(depth).toBe(6);
      expect(multiPv).toBe(1);

      const attempts = (attemptCounts.get(fen) ?? 0) + 1;
      attemptCounts.set(fen, attempts);
      if (fen === retryFen && attempts === 1) {
        throw Object.assign(new Error('Too many requests'), { status: 429 });
      }

      const index = fens.indexOf(fen);
      return makeAnalysis(fen, index * 8);
    });

    await openReplay(summary, fullGame);

    fireEvent.click(screen.getByRole('button', { name: /analyze full game/i }));

    await waitFor(() => {
      expect(screen.getByTestId('gh-summary-w')).toBeInTheDocument();
    }, { timeout: 7000 });

    const overviewCalls = evalMocks.getAnalysisOrThrow.mock.calls
      .map(([fen, depth, multiPv]) => ({ fen, depth, multiPv }));

    expect(new Set(overviewCalls.map((call) => call.fen)).size).toBe(moves.length + 1);
    expect(attemptCounts.get(retryFen)).toBe(2);
    expect(within(screen.getByTestId('gh-summary-w')).getByText(/11 analyzed moves/i)).toBeInTheDocument();
    expect(within(screen.getByTestId('gh-summary-b')).getByText(/11 analyzed moves/i)).toBeInTheDocument();
  });

  it('shows mistake markers and comparison lines and autosaves move notes', async () => {
    const summary: GameRecord = {
      id: 7,
      played_at: '2026-04-09T12:00:00.000Z',
      bot_rating: 1600,
      player_color: 'w',
      result: 'win',
      total_moves: 3,
    };
    const fullGame: GameRecord = {
      ...summary,
      moves: ['e4', 'e5', 'Qh5'],
      move_times: [3200, 4500, 7100],
      move_notes: ['Already saved', '', ''],
    };
    const [fen0, fen1, fen2, fen3] = buildFenSequence(fullGame.moves ?? []);

    evalMocks.getAnalysis.mockImplementation(async (fen: string, depth: number, multiPv: number) => {
      if (fen === fen0) return makeAnalysis(fen, 0, ['e2e4']);
      if (fen === fen1) return makeAnalysis(fen, 20, depth === 12 && multiPv === 3 ? ['c7c5', 'g1f3'] : ['c7c5']);
      if (fen === fen2) return makeAnalysis(fen, 200, ['g1f3', 'b8c6']);
      if (fen === fen3) return makeAnalysis(fen, 210, ['b8c6']);
      return null;
    });

    evalMocks.getAnalysisOrThrow.mockImplementation(async (fen: string) => {
      if (fen === fen0) return makeAnalysis(fen, 0, ['e2e4']);
      if (fen === fen1) return makeAnalysis(fen, 20, ['c7c5']);
      if (fen === fen2) return makeAnalysis(fen, 200, ['g1f3']);
      if (fen === fen3) return makeAnalysis(fen, 210, ['b8c6']);
      throw new Error(`Unexpected fen ${fen}`);
    });

    evalMocks.updateGameMoveNotes.mockResolvedValue(['Already saved', 'Pressure on f7', '']);

    await openReplay(summary, fullGame);

    expect(screen.getAllByLabelText(/saved note/i)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /analyze full game/i }));
    await waitFor(() => {
      expect(within(screen.getByTestId('gh-summary-b')).getByText('Mistake')).toBeInTheDocument();
    }, { timeout: 4000 });

    fireEvent.click(screen.getByText('e5').closest('button')!);

    await waitFor(() => {
      expect(screen.getByTestId('history-board-badge-e5')).toHaveTextContent('?');
    });

    expect(screen.getByText('Best line')).toBeInTheDocument();
    expect(screen.getByText('Played line')).toBeInTheDocument();
    expect(screen.getAllByText(/c5/).length).toBeGreaterThan(0);

    const noteField = screen.getByPlaceholderText('Your note for 1...e5');
    expect(noteField).toBeInTheDocument();

    const user = userEvent.setup();
    await user.clear(noteField);
    await user.type(noteField, 'Pressure on f7');

    expect(screen.getByText('Saving…')).toBeInTheDocument();

    await waitFor(() => {
      expect(evalMocks.updateGameMoveNotes).toHaveBeenCalledWith(7, ['Already saved', 'Pressure on f7', '']);
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });

    expect(screen.getAllByLabelText(/saved note/i)).toHaveLength(2);
    expect(screen.getByText(/e5 Nf3/)).toBeInTheDocument();
  });

  it('preserves failed note drafts and retries saving on demand', async () => {
    const summary: GameRecord = {
      id: 9,
      played_at: '2026-04-10T12:00:00.000Z',
      bot_rating: 1500,
      player_color: 'w',
      result: 'win',
      total_moves: 3,
    };
    const fullGame: GameRecord = {
      ...summary,
      moves: ['e4', 'e5', 'Qh5'],
      move_times: [2000, 2100, 2200],
      move_notes: ['', '', ''],
    };
    const [fen0, fen1, fen2, fen3] = buildFenSequence(fullGame.moves ?? []);

    evalMocks.getAnalysis.mockImplementation(async (fen: string) => {
      if (fen === fen0) return makeAnalysis(fen, 0, ['e2e4']);
      if (fen === fen1) return makeAnalysis(fen, 20, ['c7c5']);
      if (fen === fen2) return makeAnalysis(fen, 200, ['g1f3']);
      if (fen === fen3) return makeAnalysis(fen, 210, ['b8c6']);
      return null;
    });

    evalMocks.getAnalysisOrThrow.mockImplementation(async (fen: string) => {
      if (fen === fen0) return makeAnalysis(fen, 0, ['e2e4']);
      if (fen === fen1) return makeAnalysis(fen, 20, ['c7c5']);
      if (fen === fen2) return makeAnalysis(fen, 200, ['g1f3']);
      if (fen === fen3) return makeAnalysis(fen, 210, ['b8c6']);
      throw new Error(`Unexpected fen ${fen}`);
    });

    evalMocks.updateGameMoveNotes
      .mockRejectedValueOnce(new Error('Save note failed'))
      .mockResolvedValueOnce(['Retry this idea', '', '']);

    await openReplay(summary, fullGame);

    fireEvent.click(screen.getByText('e4').closest('button')!);

    const user = userEvent.setup();
    const noteField = screen.getByPlaceholderText('Your note for 1.e4');
    await user.type(noteField, 'Retry this idea');

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument();
    }, { timeout: 2000 });

    expect(noteField).toHaveValue('Retry this idea');

    await user.click(screen.getByRole('button', { name: /retry/i }));

    await waitFor(() => {
      expect(evalMocks.updateGameMoveNotes).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    });
  });
});
