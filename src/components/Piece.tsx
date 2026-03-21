import React from 'react';
import type { Piece as PieceType, PieceColor, PieceType as PSymbol } from '../engine/types';
import './Piece.css';

const PIECE_SYMBOLS: Record<PieceColor, Record<PSymbol, string>> = {
    w: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

interface PieceProps {
    piece: PieceType;
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent<HTMLSpanElement>) => void;
}

const Piece: React.FC<PieceProps> = ({ piece, draggable, onDragStart }) => {
    const symbol = PIECE_SYMBOLS[piece.color][piece.type];
    return (
        <span 
            className={`piece piece--${piece.color}`} 
            data-testid={`piece-${piece.color}-${piece.type}`}
            draggable={draggable}
            onDragStart={onDragStart}
        >
            {symbol}
        </span>
    );
};

export default Piece;
