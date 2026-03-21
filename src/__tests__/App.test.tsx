import { beforeEach, describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';

beforeEach(() => {
    localStorage.clear();
});

const startGame = () => {
    fireEvent.click(screen.getByText('Start Game'));
};

describe('App', () => {
    it('renders the chess board with 64 squares', () => {
        render(<App />);
        startGame();
        const board = screen.getByTestId('board');
        expect(board).toBeInTheDocument();
        // 64 squares
        const squares = board.querySelectorAll('[data-testid^="square-"]');
        expect(squares).toHaveLength(64);
    });

    it('shows game status', () => {
        render(<App />);
        startGame();
        const status = screen.getByTestId('game-status');
        expect(status).toHaveTextContent("White's turn");
    });

    it('shows no moves initially', () => {
        render(<App />);
        startGame();
        expect(screen.getByText('No moves yet')).toBeInTheDocument();
    });

    it('selects a piece on click and shows legal moves', () => {
        render(<App />);
        startGame();
        const e2 = screen.getByTestId('square-e2');
        fireEvent.click(e2);
        // e2 should be selected (has selected class)
        expect(e2.className).toContain('square--selected');
        // Legal targets e3 and e4 should have legal class
        const e3 = screen.getByTestId('square-e3');
        const e4 = screen.getByTestId('square-e4');
        expect(e3.className).toContain('square--legal');
        expect(e4.className).toContain('square--legal');
    });

    it('makes a move when clicking a legal target', () => {
        render(<App />);
        startGame();
        // Select e2
        fireEvent.click(screen.getByTestId('square-e2'));
        // Click e4
        fireEvent.click(screen.getByTestId('square-e4'));
        // Turn should switch to black
        expect(screen.getByTestId('game-status')).toHaveTextContent("Black's turn");
        // Move should appear in history
        expect(screen.getByText('e4')).toBeInTheDocument();
    });

    it('does not allow clicking opponent pieces', () => {
        render(<App />);
        startGame();
        // Try clicking black pawn when it is white's turn
        const e7 = screen.getByTestId('square-e7');
        fireEvent.click(e7);
        // Should not be selected
        expect(e7.className).not.toContain('square--selected');
    });

    it('deselects when clicking the same square', () => {
        render(<App />);
        startGame();
        const e2 = screen.getByTestId('square-e2');
        fireEvent.click(e2);
        expect(e2.className).toContain('square--selected');
        fireEvent.click(e2);
        expect(e2.className).not.toContain('square--selected');
    });

    it('resets the game when clicking new game button', () => {
        render(<App />);
        startGame();
        // Make a move
        fireEvent.click(screen.getByTestId('square-e2'));
        fireEvent.click(screen.getByTestId('square-e4'));
        expect(screen.getByTestId('game-status')).toHaveTextContent("Black's turn");
        // Reset
        fireEvent.click(screen.getByTestId('new-game-button'));
        startGame();
        expect(screen.getByTestId('game-status')).toHaveTextContent("White's turn");
        expect(screen.getByText('No moves yet')).toBeInTheDocument();
    });

    it('plays through scholars mate and detects checkmate', () => {
        render(<App />);
        startGame();
        // 1. e4
        fireEvent.click(screen.getByTestId('square-e2'));
        fireEvent.click(screen.getByTestId('square-e4'));
        // 1... e5
        fireEvent.click(screen.getByTestId('square-e7'));
        fireEvent.click(screen.getByTestId('square-e5'));
        // 2. Bc4
        fireEvent.click(screen.getByTestId('square-f1'));
        fireEvent.click(screen.getByTestId('square-c4'));
        // 2... Nc6
        fireEvent.click(screen.getByTestId('square-b8'));
        fireEvent.click(screen.getByTestId('square-c6'));
        // 3. Qh5
        fireEvent.click(screen.getByTestId('square-d1'));
        fireEvent.click(screen.getByTestId('square-h5'));
        // 3... Nf6
        fireEvent.click(screen.getByTestId('square-g8'));
        fireEvent.click(screen.getByTestId('square-f6'));
        // 4. Qxf7#
        fireEvent.click(screen.getByTestId('square-h5'));
        fireEvent.click(screen.getByTestId('square-f7'));

        expect(screen.getByTestId('game-status')).toHaveTextContent('Checkmate');
        expect(screen.getByTestId('game-status')).toHaveTextContent('White wins');
    });

    it('does not allow moves after checkmate', () => {
        render(<App />);
        startGame();
        // Play fool's mate
        // 1. f3
        fireEvent.click(screen.getByTestId('square-f2'));
        fireEvent.click(screen.getByTestId('square-f3'));
        // 1... e5
        fireEvent.click(screen.getByTestId('square-e7'));
        fireEvent.click(screen.getByTestId('square-e5'));
        // 2. g4
        fireEvent.click(screen.getByTestId('square-g2'));
        fireEvent.click(screen.getByTestId('square-g4'));
        // 2... Qh4#
        fireEvent.click(screen.getByTestId('square-d8'));
        fireEvent.click(screen.getByTestId('square-h4'));

        expect(screen.getByTestId('game-status')).toHaveTextContent('Checkmate');

        // Try clicking a white piece - should do nothing
        const e2 = screen.getByTestId('square-e2');
        fireEvent.click(e2);
        expect(e2.className).not.toContain('square--selected');
    });
});
