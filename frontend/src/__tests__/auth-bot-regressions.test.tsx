import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from '../App';

const authState = vi.hoisted(() => ({
  user: { id: 1, name: 'Test User', email: 'test@example.com' } as { id: number; name: string; email: string } | null,
  loading: false,
  logout: vi.fn(),
}));

const evalMocks = vi.hoisted(() => ({
  getStockfishEvaluation: vi.fn(() => Promise.resolve({ score: 10, mate: null })),
  getPolgarPuzzle: vi.fn(),
  getEndgamePosition: vi.fn(() => Promise.resolve({
    id: 'end1',
    level: 'beginner_class_d',
    levelLabel: 'Beginners to Class D (<1400)',
    chapter: 'The Staircase',
    name: 'The Staircase Mate',
    fen: '7k/8/8/8/8/8/R7/R5K1 w - - 0 1',
    side: 'w',
    description: 'Use the classic ladder pattern with two rooks to box the king in and finish the mate.',
  })),
  getStockfishBestMove: vi.fn(() => Promise.resolve('e7e5')),
  reportPuzzleResult: vi.fn(() => Promise.resolve()),
  getPuzzleStats: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: authState.loading,
    logout: authState.logout,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../engine/eval', () => ({
  getStockfishEvaluation: evalMocks.getStockfishEvaluation,
  getPolgarPuzzle: evalMocks.getPolgarPuzzle,
  getEndgamePosition: evalMocks.getEndgamePosition,
  getStockfishBestMove: evalMocks.getStockfishBestMove,
  reportPuzzleResult: evalMocks.reportPuzzleResult,
  getPuzzleStats: evalMocks.getPuzzleStats,
}));

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button onClick={onSuccess}>Mock Google Login</button>
  ),
}));

describe('auth and bot regressions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    authState.user = { id: 1, name: 'Test User', email: 'test@example.com' };
    authState.loading = false;
  });

  it('does not fetch puzzle stats while signed out', () => {
    authState.user = null;

    render(<App />);

    expect(screen.getByText(/sign in to save your puzzle progress/i)).toBeInTheDocument();
    expect(evalMocks.getPuzzleStats).not.toHaveBeenCalled();
  });

  it('clears persisted state on logout', () => {
    localStorage.setItem('chess_game_state', JSON.stringify({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'pvp',
      playerColor: 'w',
      skillLevel: 10,
      currentPuzzle: null,
      puzzleStep: 0,
      endgameInfo: null,
      selectedPolgarType: 'Mate in One',
    }));

    render(<App />);
    fireEvent.click(screen.getByTitle('Sign out'));

    expect(authState.logout).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('chess_game_state')).toBeNull();
  });

  it('asks the bot for a move after the player moves in bot mode', async () => {
    render(<App />);

    fireEvent.click(screen.getByText('Play Bot'));
    fireEvent.click(screen.getByText('Start Game'));

    fireEvent.click(screen.getByTestId('square-e2'));
    fireEvent.click(screen.getByTestId('square-e4'));

    await waitFor(() => {
      expect(evalMocks.getStockfishBestMove).toHaveBeenCalled();
    }, { timeout: 2000 });

    await waitFor(() => {
      expect(screen.getByText('e5')).toBeInTheDocument();
    }, { timeout: 2000 });
  });
});
