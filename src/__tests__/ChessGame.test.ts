import { describe, it, expect, beforeEach } from 'vitest';
import { ChessGame } from '../engine/ChessGame';

describe('ChessGame', () => {
    let game: ChessGame;

    beforeEach(() => {
        game = new ChessGame();
    });

    describe('initial state', () => {
        it('should start with white to move', () => {
            expect(game.turn()).toBe('w');
        });

        it('should have no move history', () => {
            expect(game.history()).toEqual([]);
        });

        it('should not be game over', () => {
            expect(game.isGameOver()).toBe(false);
        });

        it('should have status playing', () => {
            const status = game.getStatus();
            expect(status.state).toBe('playing');
            if (status.state === 'playing') {
                expect(status.turn).toBe('w');
            }
        });

        it('should return an 8x8 board', () => {
            const board = game.getBoard();
            expect(board).toHaveLength(8);
            board.forEach((row) => expect(row).toHaveLength(8));
        });

        it('should have pieces in correct starting positions', () => {
            const board = game.getBoard();
            // White pawns on rank 2 (index 6)
            for (let c = 0; c < 8; c++) {
                expect(board[6][c]).toEqual({ type: 'p', color: 'w' });
            }
            // Black pawns on rank 7 (index 1)
            for (let c = 0; c < 8; c++) {
                expect(board[1][c]).toEqual({ type: 'p', color: 'b' });
            }
            // White rooks
            expect(board[7][0]).toEqual({ type: 'r', color: 'w' });
            expect(board[7][7]).toEqual({ type: 'r', color: 'w' });
            // Black king
            expect(board[0][4]).toEqual({ type: 'k', color: 'b' });
        });
    });

    describe('legal moves', () => {
        it('should return legal moves for e2 pawn', () => {
            const moves = game.getLegalMoves('e2');
            expect(moves).toContain('e3');
            expect(moves).toContain('e4');
            expect(moves).toHaveLength(2);
        });

        it('should return no legal moves for an empty square', () => {
            const moves = game.getLegalMoves('e4');
            expect(moves).toEqual([]);
        });

        it('should return no legal moves for opponent pieces', () => {
            // White's turn, try getting moves for black pawn
            const moves = game.getLegalMoves('e7');
            expect(moves).toEqual([]);
        });

        it('should return legal moves for knight', () => {
            const moves = game.getLegalMoves('b1');
            expect(moves).toContain('a3');
            expect(moves).toContain('c3');
            expect(moves).toHaveLength(2);
        });
    });

    describe('making moves', () => {
        it('should make a valid move', () => {
            const result = game.makeMove('e2', 'e4');
            expect(result.success).toBe(true);
            expect(result.san).toBe('e4');
            expect(game.turn()).toBe('b');
        });

        it('should reject an invalid move', () => {
            const result = game.makeMove('e2', 'e5');
            expect(result.success).toBe(false);
            expect(game.turn()).toBe('w'); // Turn should not change
        });

        it('should alternate turns', () => {
            game.makeMove('e2', 'e4');
            expect(game.turn()).toBe('b');
            game.makeMove('e7', 'e5');
            expect(game.turn()).toBe('w');
        });

        it('should track move history', () => {
            game.makeMove('e2', 'e4');
            game.makeMove('e7', 'e5');
            expect(game.history()).toEqual(['e4', 'e5']);
        });

        it('should detect captures', () => {
            game.makeMove('e2', 'e4');
            game.makeMove('d7', 'd5');
            const result = game.makeMove('e4', 'd5');
            expect(result.success).toBe(true);
            expect(result.captured).toEqual({ type: 'p', color: 'b' });
        });
    });

    describe('check detection', () => {
        it('should detect check', () => {
            // Scholar's mate setup - put king in check
            game.makeMove('e2', 'e4');
            game.makeMove('e7', 'e5');
            game.makeMove('d1', 'h5'); // Queen to h5
            game.makeMove('b8', 'c6');
            game.makeMove('f1', 'c4'); // Bishop to c4
            game.makeMove('g8', 'f6'); // Nf6 blocks? No, Qxf7 is checkmate
            // Actually let's do a simpler check scenario
            // Reset and do a different line
            game.reset();
            game.makeMove('e2', 'e4');
            game.makeMove('f7', 'f5');
            game.makeMove('d1', 'h5'); // Qh5+ check!
            const status = game.getStatus();
            expect(status.state).toBe('check');
        });
    });

    describe('checkmate detection', () => {
        it('should detect scholars mate', () => {
            game.makeMove('e2', 'e4');
            game.makeMove('e7', 'e5');
            game.makeMove('f1', 'c4');
            game.makeMove('b8', 'c6');
            game.makeMove('d1', 'h5');
            game.makeMove('g8', 'f6');
            game.makeMove('h5', 'f7'); // Qxf7#

            expect(game.isGameOver()).toBe(true);
            const status = game.getStatus();
            expect(status.state).toBe('checkmate');
            if (status.state === 'checkmate') {
                expect(status.winner).toBe('w');
            }
        });

        it('should detect fools mate', () => {
            game.makeMove('f2', 'f3');
            game.makeMove('e7', 'e5');
            game.makeMove('g2', 'g4');
            game.makeMove('d8', 'h4'); // Qh4#

            expect(game.isGameOver()).toBe(true);
            const status = game.getStatus();
            expect(status.state).toBe('checkmate');
            if (status.state === 'checkmate') {
                expect(status.winner).toBe('b');
            }
        });
    });

    describe('stalemate detection', () => {
        it('should detect stalemate', () => {
            // Ka8, Qc7, Kb6. Black to move.
            // Ka7 attacked by Q and K, Kb8 attacked by Q. No legal moves. Not in check. = Stalemate
            const game2 = new ChessGame('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1');
            expect(game2.isGameOver()).toBe(true);
            const status = game2.getStatus();
            expect(status.state).toBe('stalemate');
        });
    });

    describe('pawn promotion', () => {
        it('should detect need for promotion', () => {
            // White pawn on e7, push to e8
            const promoGame = new ChessGame('3k4/4P3/8/8/8/8/8/4K3 w - - 0 1');
            expect(promoGame.needsPromotion('e7', 'e8')).toBe(true);
        });

        it('should promote a pawn', () => {
            const promoGame = new ChessGame('3k4/4P3/8/8/8/8/8/4K3 w - - 0 1');
            const result = promoGame.makeMove('e7', 'e8', 'q');
            expect(result.success).toBe(true);
            // Verify the pawn became a queen
            const board = promoGame.getBoard();
            expect(board[0][4]).toEqual({ type: 'q', color: 'w' });
        });
    });

    describe('reset', () => {
        it('should reset the game to initial state', () => {
            game.makeMove('e2', 'e4');
            game.makeMove('e7', 'e5');
            game.reset();

            expect(game.turn()).toBe('w');
            expect(game.history()).toEqual([]);
            expect(game.isGameOver()).toBe(false);
            // Check that pawns are back
            const board = game.getBoard();
            expect(board[6][4]).toEqual({ type: 'p', color: 'w' });
            expect(board[1][4]).toEqual({ type: 'p', color: 'b' });
        });
    });

    describe('king square detection', () => {
        it('should find white king', () => {
            expect(game.getKingSquare('w')).toBe('e1');
        });

        it('should find black king', () => {
            expect(game.getKingSquare('b')).toBe('e8');
        });
    });

    describe('insufficient material draw', () => {
        it('should detect king vs king', () => {
            const drawGame = new ChessGame('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
            expect(drawGame.isGameOver()).toBe(true);
            const status = drawGame.getStatus();
            expect(status.state).toBe('draw');
        });
    });
});
