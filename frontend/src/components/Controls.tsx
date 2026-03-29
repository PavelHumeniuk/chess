import React from 'react';
import './Controls.css';

interface ControlsProps {
    onNewGame: () => void;
    onRestartPosition: () => void;
    isGameOver: boolean;
    showEval: boolean;
    onToggleEval: () => void;
    restartLabel?: string;
    restartMode?: boolean;
}

const Controls: React.FC<ControlsProps> = ({ 
    onNewGame, 
    onRestartPosition,
    isGameOver, 
    showEval, 
    onToggleEval,
    restartLabel = '🔄 Restart',
    restartMode = false,
}) => {
    return (
        <div className="controls" data-testid="controls">
            <button
                className={`controls__button ${isGameOver ? 'controls__button--pulse' : ''}`}
                onClick={restartMode ? onRestartPosition : (isGameOver ? onRestartPosition : onNewGame)}
                data-testid="new-game-button"
            >
                {restartMode || isGameOver ? restartLabel : '🔄 Restart'}
            </button>
            <button
                className="controls__button"
                onClick={onToggleEval}
            >
                {showEval ? 'Hide Eval Bar' : 'Show Eval Bar'}
            </button>
        </div>
    );
};

export default Controls;
