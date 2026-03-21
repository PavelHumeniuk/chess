import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import * as evalEngine from '../engine/eval';

// Mock the evaluation engine
vi.mock('../engine/eval', () => ({
    getStockfishEvaluation: vi.fn(() => Promise.resolve({ score: 10, mate: null })),
    getRandomPuzzle: vi.fn(() => Promise.resolve({
        id: '123',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: ['e2e4'],
        solution: ['e2e4'],
        rating: 1500,
        themes: ['mate']
    })),
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

    it('Game 5: Puzzle Mode Flow', async () => {
        render(<App />);
        fireEvent.click(screen.getByText('Lichess'));
        startGame();
        
        await waitFor(() => {
            expect(evalEngine.getRandomPuzzle).toHaveBeenCalled();
        });

        // Make correct move (e2e4)
        fireEvent.click(screen.getByTestId('square-e2'));
        fireEvent.click(screen.getByTestId('square-e4'));

        expect(screen.getByText(/Correct!/i)).toBeInTheDocument();
        expect(screen.getByText('Next Puzzle ➡️')).toBeInTheDocument();
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
        startGame();

        await waitFor(() => {
            expect(evalEngine.getEndgamePosition).toHaveBeenCalled();
        });

        expect(screen.getByText('King and Queen vs King')).toBeInTheDocument();
        expect(screen.getByText('Checkmate with King and Queen')).toBeInTheDocument();
    });
});
