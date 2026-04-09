import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import GameHistory from '../pages/GameHistory';
import { ChessGame } from '../engine/ChessGame';
import type { EngineAnalysis, GameRecord } from '../engine/eval';

const evalMocks = vi.hoisted(() => ({
  getGames: vi.fn(),
  getGame: vi.fn(),
  getAnalysis: vi.fn(),
  deleteGame: vi.fn(),
}));

vi.mock('../components/Board', () => ({
  default: () => <div data-testid="history-board" />,
}));

vi.mock('../engine/eval', () => ({
  getGames: evalMocks.getGames,
  getGame: evalMocks.getGame,
  getAnalysis: evalMocks.getAnalysis,
  deleteGame: evalMocks.deleteGame,
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

function makeAnalysis(fen: string, whiteScore: number, bestMove: string): EngineAnalysis {
  const activeColor = fen.split(' ')[1] === 'b' ? -1 : 1;
  const rawScore = whiteScore * activeColor;
  return {
    score: rawScore,
    mate: null,
    lines: [{ score: rawScore, mate: null, pv: [bestMove] }],
  };
}

describe('GameHistory replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn(() => true);
    window.alert = vi.fn();
  });

  it('analyzes the full game without requiring manual move-by-move navigation', async () => {
    const gameSummary: GameRecord = {
      id: 7,
      played_at: '2026-04-09T12:00:00.000Z',
      bot_rating: 1600,
      player_color: 'w',
      result: 'win',
      total_moves: 3,
    };
    const fullGame: GameRecord = {
      ...gameSummary,
      moves: ['e4', 'e5', 'Qh5'],
    };
    const [fen0, fen1, fen2, fen3] = buildFenSequence(fullGame.moves ?? []);

    evalMocks.getGames.mockResolvedValue([gameSummary]);
    evalMocks.getGame.mockResolvedValue(fullGame);
    evalMocks.getAnalysis.mockImplementation(async (fen: string) => {
      if (fen === fen0) return makeAnalysis(fen, 0, 'e2e4');
      if (fen === fen1) return makeAnalysis(fen, 20, 'c7c5');
      if (fen === fen2) return makeAnalysis(fen, 200, 'g1f3');
      if (fen === fen3) return makeAnalysis(fen, 210, 'b8c6');
      return null;
    });

    render(<GameHistory />);

    await waitFor(() => {
      expect(screen.getByText(/bot 1600 elo/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/bot 1600 elo/i));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /analyze full game/i })).toBeInTheDocument();
    });

    expect(screen.getByText(/analyze the full game to see per-player accuracy/i)).toBeInTheDocument();
    expect(screen.queryByText('Mistake')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /analyze full game/i }));

    await waitFor(() => {
      expect(within(screen.getByTestId('gh-summary-b')).getByText('Mistake')).toBeInTheDocument();
    });

    expect(evalMocks.getAnalysis).toHaveBeenCalledWith(fen0, 10, 3);
    expect(evalMocks.getAnalysis).toHaveBeenCalledWith(fen1, 10, 3);
    expect(evalMocks.getAnalysis).toHaveBeenCalledWith(fen2, 10, 3);
    expect(evalMocks.getAnalysis).toHaveBeenCalledWith(fen3, 12, 3);
    expect(screen.getByRole('button', { name: /previous move/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next move/i })).toBeInTheDocument();

    const whiteSummary = screen.getByTestId('gh-summary-w');
    const blackSummary = screen.getByTestId('gh-summary-b');

    expect(within(whiteSummary).getByText('White Accuracy')).toBeInTheDocument();
    expect(within(whiteSummary).getByText('100.0%')).toBeInTheDocument();
    expect(within(whiteSummary).getByText('2 analyzed moves')).toBeInTheDocument();
    expect(within(whiteSummary).getByText('Best')).toBeInTheDocument();
    expect(within(whiteSummary).getByText('Good')).toBeInTheDocument();
    expect(within(whiteSummary).getAllByText(/^1$/)).toHaveLength(2);

    expect(within(blackSummary).getByText('Black Accuracy')).toBeInTheDocument();
    expect(within(blackSummary).getByText('1 analyzed move')).toBeInTheDocument();
    expect(within(blackSummary).getByText('Mistake')).toBeInTheDocument();
    expect(within(blackSummary).getByText('55.0%')).toBeInTheDocument();
  });
});
