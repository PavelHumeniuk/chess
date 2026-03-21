import { Chess } from 'chess.js';
import type { Square, PieceColor, PieceType, GameStatus, MoveResult, Board } from './types';

export class ChessGame {
    private chess: Chess;

    constructor(fen?: string) {
        this.chess = new Chess(fen);
    }

    getBoard(): Board {
        return this.chess.board().map((row) =>
            row.map((sq) => (sq ? { type: sq.type as PieceType, color: sq.color as PieceColor } : null))
        );
    }

    getLegalMoves(square: Square): Square[] {
        const moves = this.chess.moves({ square, verbose: true });
        return moves.map((m) => m.to as Square);
    }

    makeMove(from: Square, to: Square, promotion?: PieceType): MoveResult {
        try {
            const move = this.chess.move({ from, to, promotion });
            if (!move) {
                return { success: false };
            }
            return {
                success: true,
                san: move.san,
                captured: move.captured
                    ? { type: move.captured as PieceType, color: (move.color === 'w' ? 'b' : 'w') as PieceColor }
                    : undefined,
                promotion: !!move.promotion,
            };
        } catch {
            return { success: false };
        }
    }

    getStatus(): GameStatus {
        if (this.chess.isCheckmate()) {
            // The player whose turn it is has been checkmated, so the winner is the other player
            const winner = this.chess.turn() === 'w' ? 'b' : 'w';
            return { state: 'checkmate', winner: winner as PieceColor };
        }
        if (this.chess.isStalemate()) {
            return { state: 'stalemate' };
        }
        if (this.chess.isDraw()) {
            let reason = 'draw';
            if (this.chess.isThreefoldRepetition()) reason = 'threefold repetition';
            else if (this.chess.isInsufficientMaterial()) reason = 'insufficient material';
            // 50-move rule is also covered by isDraw()
            return { state: 'draw', reason };
        }
        if (this.chess.inCheck()) {
            return { state: 'check', turn: this.chess.turn() as PieceColor };
        }
        return { state: 'playing', turn: this.chess.turn() as PieceColor };
    }

    isGameOver(): boolean {
        return this.chess.isGameOver();
    }

    turn(): PieceColor {
        return this.chess.turn() as PieceColor;
    }

    history(): string[] {
        return this.chess.history();
    }

    fen(): string {
        return this.chess.fen();
    }

    reset(): void {
        this.chess.reset();
    }

    load(fen: string): void {
        this.chess.load(fen);
    }

    needsPromotion(from: Square, to: Square): boolean {
        const moves = this.chess.moves({ square: from, verbose: true });
        return moves.some((m) => m.to === to && m.promotion);
    }

    getKingSquare(color: PieceColor): Square | null {
        const board = this.chess.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const sq = board[r][c];
                if (sq && sq.type === 'k' && sq.color === color) {
                    const file = String.fromCharCode(97 + c);
                    const rank = 8 - r;
                    return `${file}${rank}` as Square;
                }
            }
        }
        return null;
    }
}
