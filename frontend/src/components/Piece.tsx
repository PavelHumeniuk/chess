import React from 'react';
import type { Piece as PieceType, PieceColor, PieceType as PSymbol } from '../engine/types';
import './Piece.css';

const PIECE_IMAGES: Record<PieceColor, Record<PSymbol, string>> = {
    w: {
        k: 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg',
        q: 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
        r: 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
        b: 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
        n: 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
        p: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
    },
    b: {
        k: 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg',
        q: 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
        r: 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
        b: 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
        n: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
        p: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
    },
};

const PIECE_FALLBACK: Record<PieceColor, Record<PSymbol, string>> = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

interface PieceProps {
    piece: PieceType;
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent<HTMLDivElement>) => void;
}

const Piece: React.FC<PieceProps> = ({ piece, draggable, onDragStart }) => {
    const [imageFailed, setImageFailed] = React.useState(false);
    const imageUrl = PIECE_IMAGES[piece.color][piece.type];
    const fallbackSymbol = PIECE_FALLBACK[piece.color][piece.type];

    return (
        <div 
            className={`piece piece--${piece.color} piece--${piece.type}`} 
            data-testid={`piece-${piece.color}-${piece.type}`}
            draggable={draggable}
            onDragStart={onDragStart}
            aria-label={`${piece.color}-${piece.type}`}
        >
            {!imageFailed ? (
                <img
                    className="piece__img"
                    src={imageUrl}
                    alt=""
                    draggable={false}
                    onError={() => setImageFailed(true)}
                />
            ) : (
                <span className="piece__fallback">{fallbackSymbol}</span>
            )}
        </div>
    );
};

export default Piece;
