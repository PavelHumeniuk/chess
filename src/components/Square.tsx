import React from 'react';
import PieceComponent from './Piece';
import type { Piece as PieceType, Square as SquareType } from '../engine/types';
import './Square.css';

interface SquareProps {
    square: SquareType;
    piece: PieceType | null;
    isLight: boolean;
    isSelected: boolean;
    isLegalTarget: boolean;
    isLastMoveFrom: boolean;
    isLastMoveTo: boolean;
    isKingInCheck: boolean;
    onClick: (square: SquareType) => void;
    onDropPiece?: (source: SquareType, target: SquareType) => void;
}

const Square: React.FC<SquareProps> = ({
    square,
    piece,
    isLight,
    isSelected,
    isLegalTarget,
    isLastMoveFrom,
    isLastMoveTo,
    isKingInCheck,
    onClick,
    onDropPiece,
}) => {
    const classNames = [
        'square',
        isLight ? 'square--light' : 'square--dark',
        isSelected && 'square--selected',
        isLegalTarget && 'square--legal',
        isLastMoveFrom && 'square--last-from',
        isLastMoveTo && 'square--last-to',
        isKingInCheck && 'square--check',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={classNames}
            data-testid={`square-${square}`}
            onClick={() => onClick(square)}
            onDragOver={(e) => {
                e.preventDefault(); // Necessary to allow drop
                e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
                e.preventDefault();
                const source = e.dataTransfer.getData('text/plain') as SquareType;
                if (source && source !== square && onDropPiece) {
                    onDropPiece(source, square);
                }
            }}
        >
            {piece && (
                <PieceComponent 
                    piece={piece}
                    draggable={true}
                    onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', square);
                        e.dataTransfer.effectAllowed = 'move';
                    }}
                />
            )}
            {isLegalTarget && !piece && <div className="square__legal-dot" />}
            {isLegalTarget && piece && <div className="square__legal-capture" />}
        </div>
    );
};

export default React.memo(Square);
