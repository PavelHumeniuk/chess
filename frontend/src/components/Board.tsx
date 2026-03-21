import React from 'react';
import SquareComponent from './Square';
import type { Square, Piece, Board as BoardData } from '../engine/types';
import './Board.css';

interface LastMove {
    from: Square;
    to: Square;
}

interface BoardProps {
    board: BoardData;
    selectedSquare: Square | null;
    legalMoves: Square[];
    lastMove: LastMove | null;
    kingInCheck: Square | null;
    isFlipped?: boolean;
    onSquareClick: (square: Square) => void;
    onDropPiece?: (source: Square, target: Square) => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];

const Board: React.FC<BoardProps> = ({
    board,
    selectedSquare,
    legalMoves,
    lastMove,
    kingInCheck,
    isFlipped = false,
    onSquareClick,
    onDropPiece,
}) => {
    const displayRanks = isFlipped ? [...RANKS].reverse() : RANKS;
    const displayFiles = isFlipped ? [...FILES].reverse() : FILES;

    return (
        <div className="board-wrapper">
            <div className="board" data-testid="board">
                {displayRanks.map((rank) =>
                    displayFiles.map((file) => {
                        const square = `${file}${rank}` as Square;
                        const rowIdx = 8 - rank;
                        const colIdx = file.charCodeAt(0) - 97;
                        const piece: Piece | null = board[rowIdx][colIdx];
                        const isLight = (rowIdx + colIdx) % 2 === 0;

                        return (
                            <SquareComponent
                                key={square}
                                square={square}
                                piece={piece}
                                isLight={isLight}
                                isSelected={selectedSquare === square}
                                isLegalTarget={legalMoves.includes(square)}
                                isLastMoveFrom={lastMove?.from === square}
                                isLastMoveTo={lastMove?.to === square}
                                isKingInCheck={kingInCheck === square}
                                onClick={onSquareClick}
                                onDropPiece={onDropPiece}
                            />
                        );
                    })
                )}
            </div>
            {/* File labels */}
            <div className="board-labels board-labels--files">
                {displayFiles.map((f) => (
                    <span key={f} className="board-label">{f}</span>
                ))}
            </div>
            {/* Rank labels */}
            <div className="board-labels board-labels--ranks">
                {displayRanks.map((r) => (
                    <span key={r} className="board-label">{r}</span>
                ))}
            </div>
        </div>
    );
};

export default Board;
