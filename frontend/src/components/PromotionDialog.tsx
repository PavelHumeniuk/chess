import React from 'react';
import type { PieceColor, PieceType } from '../engine/types';
import './PromotionDialog.css';

interface PromotionDialogProps {
    color: PieceColor;
    onSelect: (piece: PieceType) => void;
}

const PROMOTION_PIECES: { type: PieceType; label: Record<PieceColor, string> }[] = [
    { type: 'q', label: { w: '♕', b: '♛' } },
    { type: 'r', label: { w: '♖', b: '♜' } },
    { type: 'b', label: { w: '♗', b: '♝' } },
    { type: 'n', label: { w: '♘', b: '♞' } },
];

const PromotionDialog: React.FC<PromotionDialogProps> = ({ color, onSelect }) => {
    return (
        <div className="promotion-overlay" data-testid="promotion-dialog">
            <div className="promotion-dialog">
                <h3 className="promotion-dialog__title">Promote Pawn</h3>
                <div className="promotion-dialog__options">
                    {PROMOTION_PIECES.map((p) => (
                        <button
                            key={p.type}
                            className={`promotion-dialog__option promotion-dialog__option--${color}`}
                            onClick={() => onSelect(p.type)}
                            data-testid={`promote-${p.type}`}
                        >
                            {p.label[color]}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PromotionDialog;
