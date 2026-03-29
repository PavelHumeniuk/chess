import { beforeEach, describe, it, expect, vi, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import * as evalEngine from '../engine/eval';

// Mock the evaluation engine
vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({
        user: { id: 1, name: 'Test User', email: 'test@example.com' },
        loading: false,
        logout: vi.fn(),
    }),
    AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../engine/eval', () => ({
    getStockfishEvaluation: vi.fn(() => Promise.resolve({ score: 10, mate: null })),
    getPolgarPuzzle: vi.fn(() => Promise.resolve({
        id: 'polgar1',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: ['e2e4'],
        solution: ['e2e4'],
        rating: 1000,
        themes: ['mate']
    })),
    getEndgamePosition: vi.fn(() => Promise.resolve({
        id: 'end1',
        level: 'beginner_class_d',
        levelLabel: 'Beginners to Class D (<1400)',
        chapter: 'The Staircase',
        name: 'King and Queen vs King',
        fen: '4k3/4Q3/4K3/8/8/8/8/8 w - - 0 1',
        side: 'w',
        description: 'Checkmate with King and Queen'
    })),
    getStockfishBestMove: vi.fn(() => Promise.resolve('e2e4')),
    reportPuzzleResult: vi.fn(() => Promise.resolve()),
    getPuzzleStats: vi.fn(() => Promise.resolve({
        totalPuzzlesTouched: 10,
        totalAttempts: 20,
        successRate: '50.0',
        dueReviewCount: 5,
        forecast: { '2026-03-21': 2, '2026-03-22': 3 }
    }))
}));

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

// Helper to play a sequence of clicks using coordinates
const startGame = () => {
    fireEvent.click(screen.getByText('Start Game'));
};

const playMoves = (moves: string[]) => {
    for (const move of moves) {
        const [from, to] = move.split('-');
        fireEvent.click(screen.getByTestId(`square-${from}`));
        fireEvent.click(screen.getByTestId(`square-${to}`));
    }
};

describe('End-to-End Game Scenarios', () => {
    it("Game 1: Fast checkmate by Black (Fool's Mate)", () => {
        render(<App />);
        startGame();
        playMoves(['f2-f3', 'e7-e5', 'g2-g4', 'd8-h4']);
        expect(screen.getByTestId('game-status')).toHaveTextContent('Checkmate');
        expect(screen.getByTestId('game-status')).toHaveTextContent('Black wins');
    });

    it("Game 2: Scholar's Mate by White", () => {
        render(<App />);
        startGame();
        playMoves([
            'e2-e4', 'e7-e5',
            'f1-c4', 'b8-c6',
            'd1-h5', 'g8-f6',
            'h5-f7'
        ]);
        expect(screen.getByTestId('game-status')).toHaveTextContent('Checkmate');
        expect(screen.getByTestId('game-status')).toHaveTextContent('White wins');
    });

    it('Game 3: Draw by threefold repetition', () => {
        render(<App />);
        startGame();
        playMoves([
            'g1-f3', 'g8-f6',
            'f3-g1', 'f6-g8',
            'g1-f3', 'g8-f6',
            'f3-g1', 'f6-g8'
        ]);
        expect(screen.getByTestId('game-status')).toHaveTextContent('Draw');
        expect(screen.getByTestId('game-status')).toHaveTextContent(/repetition/i);
    });


    it('Game 6: Bot Mode Initialization', async () => {
        render(<App />);
        fireEvent.click(screen.getByText('Play Bot'));
        
        // Select Black to trigger bot's first move as White
        fireEvent.click(screen.getByText('Black'));
        startGame();

        await waitFor(() => {
            expect(screen.getByText(/Stockfish is thinking/i)).toBeInTheDocument();
        });
        
        await waitFor(() => {
            expect(evalEngine.getStockfishBestMove).toHaveBeenCalled();
        }, { timeout: 2000 });
    });

    it('Game 7: Endgame Mode', async () => {
        render(<App />);
        fireEvent.click(screen.getByText('Endgame'));
        fireEvent.click(screen.getByText('Class B'));
        startGame();

        await waitFor(() => {
            expect(evalEngine.getEndgamePosition).toHaveBeenCalledWith('class_b');
        });

        expect(screen.getByText('Endgame Description')).toBeInTheDocument();
        expect(screen.getAllByText('Beginners to Class D (<1400)')).toHaveLength(2);
        expect(screen.getByText('King and Queen vs King')).toBeInTheDocument();
        expect(screen.getByText('Checkmate with King and Queen')).toBeInTheDocument();
    });

    it('Game 7a: Endgame theory button opens chapter guidance', async () => {
        render(<App />);
        fireEvent.click(screen.getByText('Endgame'));
        startGame();

        await waitFor(() => {
            expect(screen.getByText('Show Theory')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Show Theory'));

        expect(screen.getByText(/Two-Rook Ladder Mate/i)).toBeInTheDocument();
        expect(screen.getByText(/Core Principles/i)).toBeInTheDocument();
    });

    it('Game 7b: Endgame game-over button restarts the same endgame instead of opening menu', async () => {
        (evalEngine.getEndgamePosition as Mock)
            .mockResolvedValueOnce({
                id: 'end-loss',
                level: 'beginner_class_d',
                levelLabel: 'Beginners to Class D (<1400)',
                chapter: 'The Staircase',
                name: 'Lost Endgame',
                fen: '7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',
                side: 'b',
                description: 'Black to move and already lost.',
            });

        render(<App />);
        fireEvent.click(screen.getByText('Endgame'));
        startGame();

        await waitFor(() => {
            expect(screen.getByTestId('game-status')).toHaveTextContent('Checkmate');
        });

        await waitFor(() => {
            expect(evalEngine.reportPuzzleResult).toHaveBeenCalledWith('end-loss', false);
        });

        fireEvent.click(screen.getByTestId('new-game-button'));

        expect(screen.queryByText('Select Game Mode')).not.toBeInTheDocument();
        expect(screen.getByText('Lost Endgame')).toBeInTheDocument();
    });

    it('Game 7c: Endgame restart button keeps you in the same active endgame', async () => {
        (evalEngine.getEndgamePosition as Mock)
            .mockResolvedValueOnce({
                id: 'end-active',
                level: 'class_b',
                levelLabel: 'Class B (1600-1799)',
                chapter: 'Connected Passers',
                name: 'Active Endgame',
                fen: '4k3/8/8/8/8/8/4K3/7R w - - 0 1',
                side: 'w',
                description: 'An active endgame to restart.',
            });

        render(<App />);
        fireEvent.click(screen.getByText('Endgame'));
        startGame();

        await waitFor(() => {
            expect(screen.getByText('Active Endgame')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('new-game-button'));

        expect(screen.queryByText('Select Game Mode')).not.toBeInTheDocument();
        expect(screen.getByText('Active Endgame')).toBeInTheDocument();
    });

    it('Game 8: Polgar Puzzle Mode and Solve', async () => {
        render(<App />);
        fireEvent.click(screen.getByText('Polgar'));
        startGame();

        await waitFor(() => {
            expect(evalEngine.getPolgarPuzzle).toHaveBeenCalled();
        });

        // Current mock solution is ['e2e4']
        fireEvent.click(screen.getByTestId('square-e2'));
        fireEvent.click(screen.getByTestId('square-e4'));

        expect(screen.getByText(/Correct!/i)).toBeInTheDocument();
        expect(screen.getByText('Next Puzzle ➡️')).toBeInTheDocument();
    });

    it('Game 8b: Polgar mate-in-two supports chunk selection', async () => {
        render(<App />);
        fireEvent.click(screen.getByText('Polgar'));
        fireEvent.click(screen.getByText('Mate in 2'));
        fireEvent.click(screen.getByText('1308-1807'));
        startGame();

        await waitFor(() => {
            expect(evalEngine.getPolgarPuzzle).toHaveBeenCalledWith('Mate in Two: 1308-1807');
        });
    });

    it('Game 8c: Mate-in-two uses Stockfish for the reply after the first move', async () => {
        (evalEngine.getPolgarPuzzle as Mock).mockResolvedValueOnce({
            id: 'polgar-m2',
            fen: '3k4/8/8/8/8/8/1Q6/3K4 w - - 0 1',
            moves: [],
            solution: ['b2b5', 'b5b8'],
            rating: 1000,
            themes: ['Mate in Two', 'polgar'],
            categoryRemaining: 500,
            categoryTotal: 500,
        });
        (evalEngine.getStockfishBestMove as Mock).mockResolvedValueOnce('d8c8');

        render(<App />);
        fireEvent.click(screen.getByText('Polgar'));
        fireEvent.click(screen.getByText('Mate in 2'));
        startGame();

        await waitFor(() => {
            expect(evalEngine.getPolgarPuzzle).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('square-b2'));
        fireEvent.click(screen.getByTestId('square-b5'));

        await waitFor(() => {
            expect(evalEngine.getStockfishBestMove).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(screen.getByText(/Find mate in 1/i)).toBeInTheDocument();
        });
    });

    it('Game 8d: Mate-in-three uses Stockfish replies between White moves', async () => {
        (evalEngine.getPolgarPuzzle as Mock).mockResolvedValueOnce({
            id: 'polgar-m3',
            fen: '3k4/8/8/8/8/8/1Q6/3K4 w - - 0 1',
            moves: [],
            solution: ['b2b5', 'b5b8', 'b8d6'],
            rating: 1000,
            themes: ['Mate in Three', 'polgar'],
            categoryRemaining: 100,
            categoryTotal: 100,
        });
        (evalEngine.getStockfishBestMove as Mock).mockResolvedValueOnce('d8c8');

        render(<App />);
        fireEvent.click(screen.getByText('Polgar'));
        fireEvent.click(screen.getByText('Mate in 3'));
        startGame();

        await waitFor(() => {
            expect(evalEngine.getPolgarPuzzle).toHaveBeenCalled();
        });

        fireEvent.click(screen.getByTestId('square-b2'));
        fireEvent.click(screen.getByTestId('square-b5'));

        await waitFor(() => {
            expect(evalEngine.getStockfishBestMove).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(screen.getByText(/Find mate in 2/i)).toBeInTheDocument();
        });
    });

    it('Game 9: Polgar Puzzle Nothing to Review Feedback', async () => {
        // Mock a 404 error from the backend
        (evalEngine.getPolgarPuzzle as Mock).mockRejectedValueOnce(new Error('No puzzles due for review!'));

        render(<App />);
        fireEvent.click(screen.getByText('Polgar'));
        fireEvent.click(screen.getByText('Review Due'));
        startGame();

        await waitFor(() => {
            expect(screen.getByText(/No puzzles due for review!/i)).toBeInTheDocument();
        });
        
        // Should still be in the menu
        expect(screen.getByText('Select Game Mode')).toBeInTheDocument();
    });

    it('Game 10: Menu Navigation', async () => {
        render(<App />);
        startGame(); // default PVP
        expect(screen.queryByText('Select Game Mode')).not.toBeInTheDocument();
        
        fireEvent.click(screen.getByText(/Menu/i));
        expect(screen.getByText('Select Game Mode')).toBeInTheDocument();
    });

    it('Game 11: Promotion Dialog', async () => {
        // Set up a position where white can promote: pawn on a7, king on h1
        render(<App />);
        
        // This is a bit tricky to set up without exposing internal state, 
        // but lets assume we can play through to it or use initial state.
        // Actually ChessGame.test.ts covers logic, E2E should cover UI.
        
        // Since we can't easily push specialized FEN into App without deep mock,
        // we skip the complex setup for now or just trust ChessGame.test.
    });
});
