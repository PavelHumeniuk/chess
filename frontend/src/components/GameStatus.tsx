import React from 'react';
import type { GameStatus as GameStatusType } from '../engine/types';
import './GameStatus.css';

interface GameStatusProps {
    status: GameStatusType;
    timerLabel?: string | null;
    timerValue?: string | null;
}

const colorName = (c: 'w' | 'b') => (c === 'w' ? 'White' : 'Black');

const GameStatus: React.FC<GameStatusProps> = ({ status, timerLabel, timerValue }) => {
    let message: string;
    let statusClass = 'game-status';

    switch (status.state) {
        case 'playing':
            message = `${colorName(status.turn)}'s turn`;
            break;
        case 'check':
            message = `${colorName(status.turn)} is in check!`;
            statusClass += ' game-status--check';
            break;
        case 'checkmate':
            message = `Checkmate! ${colorName(status.winner)} wins!`;
            statusClass += ' game-status--gameover';
            break;
        case 'stalemate':
            message = 'Stalemate — Draw!';
            statusClass += ' game-status--gameover';
            break;
        case 'draw':
            message = `Draw — ${status.reason}`;
            statusClass += ' game-status--gameover';
            break;
    }

    return (
        <div className={statusClass} data-testid="game-status">
            <div className="game-status__indicator">
                {(status.state === 'playing' || status.state === 'check') && (
                    <div className={`game-status__turn-dot game-status__turn-dot--${status.turn}`} />
                )}
            </div>
            <div className="game-status__body">
                <span className="game-status__text">{message}</span>
                {timerLabel && timerValue && (
                    <span className="game-status__timer" data-testid="game-status-timer">
                        {timerLabel}: {timerValue}
                    </span>
                )}
            </div>
        </div>
    );
};

export default GameStatus;
