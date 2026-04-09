import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  saveGame: vi.fn(() => Promise.resolve()),
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
  saveGame: evalMocks.saveGame,
}));

vi.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ onSuccess }: { onSuccess?: () => void }) => (
    <button onClick={onSuccess}>Mock Google Login</button>
  ),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('auth and bot regressions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('drops a finished cached game instead of reopening it on startup', () => {
    localStorage.setItem('chess_game_state', JSON.stringify({
      fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3',
      mode: 'bot',
      playerColor: 'w',
      skillLevel: 10,
      currentPuzzle: null,
      puzzleStep: 0,
      endgameInfo: null,
      selectedPolgarType: 'Mate in One',
      selectedEndgameLevel: 'beginner_class_d',
    }));

    render(<App />);

    expect(screen.getByText('Start Game')).toBeInTheDocument();
    expect(screen.queryByTestId('board')).not.toBeInTheDocument();
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

    expect(evalMocks.getStockfishBestMove).toHaveBeenCalledWith(expect.any(String), 10, 10);

    await waitFor(() => {
      expect(screen.getByText('e5')).toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('uses stronger Stockfish settings for endgame replies', async () => {
    evalMocks.getEndgamePosition.mockResolvedValueOnce({
      id: 'end-strong',
      level: 'beginner_class_d',
      levelLabel: 'Beginners to Class D (<1400)',
      chapter: 'The Staircase',
      name: 'Immediate Endgame Reply',
      fen: '7k/8/8/8/8/8/R7/R5K1 w - - 0 1',
      side: 'b',
      description: 'Engine should move immediately in endgame mode.',
    });

    render(<App />);

    fireEvent.click(screen.getByText('Endgame'));
    fireEvent.click(screen.getByText('Start Game'));

    await waitFor(() => {
      expect(evalMocks.getStockfishBestMove).toHaveBeenCalledWith(expect.any(String), 16, 20);
    }, { timeout: 2000 });
  });

  it('does not save completed bot games with fewer than five moves', async () => {
    evalMocks.getStockfishBestMove
      .mockResolvedValueOnce('e7e5')
      .mockResolvedValueOnce('d8h4');

    render(<App />);

    fireEvent.click(screen.getByText('Play Bot'));
    fireEvent.click(screen.getByText('Start Game'));

    fireEvent.click(screen.getByTestId('square-f2'));
    fireEvent.click(screen.getByTestId('square-f3'));

    await waitFor(() => {
      expect(screen.getByText('e5')).toBeInTheDocument();
    }, { timeout: 2000 });

    fireEvent.click(screen.getByTestId('square-g2'));
    fireEvent.click(screen.getByTestId('square-g4'));

    await waitFor(() => {
      expect(screen.getByTestId('game-status')).toHaveTextContent('Checkmate');
    }, { timeout: 2000 });

    expect(evalMocks.saveGame).not.toHaveBeenCalled();
  });

  it('tracks and saves move times for completed bot games', async () => {
    vi.useFakeTimers();
    evalMocks.getStockfishBestMove
      .mockResolvedValueOnce('e7e5')
      .mockResolvedValueOnce('b8c6')
      .mockResolvedValueOnce('g8f6');

    render(<App />);

    fireEvent.click(screen.getByText('Play Bot'));
    fireEvent.click(screen.getByText('Start Game'));

    expect(screen.getByTestId('game-status-timer')).toHaveTextContent('Your move time: 0.0s');

    await act(async () => {
      vi.advanceTimersByTime(3200);
    });
    expect(screen.getByTestId('game-status-timer')).toHaveTextContent('Your move time: 3.2s');

    fireEvent.click(screen.getByTestId('square-e2'));
    fireEvent.click(screen.getByTestId('square-e4'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.getByText('e5')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });
    fireEvent.click(screen.getByTestId('square-f1'));
    fireEvent.click(screen.getByTestId('square-c4'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.getByText('Nc6')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2800);
    });
    fireEvent.click(screen.getByTestId('square-d1'));
    fireEvent.click(screen.getByTestId('square-h5'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(screen.getByText('Nf6')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    fireEvent.click(screen.getByTestId('square-h5'));
    fireEvent.click(screen.getByTestId('square-f7'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(evalMocks.saveGame).toHaveBeenCalledWith(expect.objectContaining({
      moves: ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'],
      moveTimes: [3200, 400, 2100, 400, 2800, 400, 900],
    }));
  });

  it('ignores a stale endgame bot reply after restarting the position', async () => {
    const firstReply = createDeferred<string | null>();
    const secondReply = createDeferred<string | null>();

    evalMocks.getEndgamePosition.mockResolvedValueOnce({
      id: 'end-stale',
      level: 'beginner_class_d',
      levelLabel: 'Beginners to Class D (<1400)',
      chapter: 'The Staircase',
      name: 'Restart Guard Endgame',
      fen: '7k/8/8/8/8/8/R7/R5K1 w - - 0 1',
      side: 'b',
      description: 'The bot should move for White, but stale replies must be ignored.',
    });
    evalMocks.getStockfishBestMove
      .mockImplementationOnce(() => firstReply.promise)
      .mockImplementationOnce(() => secondReply.promise);

    render(<App />);

    fireEvent.click(screen.getByText('Endgame'));
    fireEvent.click(screen.getByText('Start Game'));

    await waitFor(() => {
      expect(evalMocks.getStockfishBestMove).toHaveBeenCalledTimes(1);
    }, { timeout: 2000 });

    fireEvent.click(screen.getByTestId('new-game-button'));

    expect(within(screen.getByTestId('square-a2')).getByLabelText('w-r')).toBeInTheDocument();

    await act(async () => {
      firstReply.resolve('a2a8');
      await Promise.resolve();
    });

    expect(evalMocks.getStockfishBestMove).toHaveBeenCalledTimes(1);
    expect(within(screen.getByTestId('square-a2')).getByLabelText('w-r')).toBeInTheDocument();
    expect(within(screen.getByTestId('square-a8')).queryByLabelText('w-r')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(evalMocks.getStockfishBestMove).toHaveBeenCalledTimes(2);
    }, { timeout: 2000 });

    await act(async () => {
      secondReply.resolve('a2a8');
      await Promise.resolve();
    });

    expect(within(screen.getByTestId('square-a8')).getByLabelText('w-r')).toBeInTheDocument();
  });

  it('ignores a stale puzzle reply after restarting the puzzle', async () => {
    const reply = createDeferred<string | null>();

    evalMocks.getPolgarPuzzle.mockResolvedValueOnce({
      id: 'polgar-stale',
      fen: '3k4/8/8/8/8/8/1Q6/3K4 w - - 0 1',
      moves: [],
      solution: ['b2b5', 'b5b8'],
      rating: 1000,
      themes: ['Mate in Two', 'polgar'],
      categoryRemaining: 2,
      categoryTotal: 2,
    });
    evalMocks.getStockfishBestMove.mockImplementationOnce(() => reply.promise);

    render(<App />);

    fireEvent.click(screen.getByText('Polgar'));
    fireEvent.click(screen.getByText('Mate in 2'));
    fireEvent.click(screen.getByText('Start Game'));

    await waitFor(() => {
      expect(evalMocks.getPolgarPuzzle).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByTestId('square-b2'));
    fireEvent.click(screen.getByTestId('square-b5'));

    await waitFor(() => {
      expect(evalMocks.getStockfishBestMove).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('new-game-button'));

    expect(within(screen.getByTestId('square-b2')).getByLabelText('w-q')).toBeInTheDocument();

    await act(async () => {
      reply.resolve('d8c8');
      await Promise.resolve();
    });

    expect(within(screen.getByTestId('square-b2')).getByLabelText('w-q')).toBeInTheDocument();
    expect(within(screen.getByTestId('square-d8')).getByLabelText('b-k')).toBeInTheDocument();
    expect(within(screen.getByTestId('square-c8')).queryByLabelText('b-k')).not.toBeInTheDocument();
  });
});
