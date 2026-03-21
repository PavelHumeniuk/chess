import React from 'react';
import './Controls.css';

interface ControlsProps {
    onNewGame: () => void;
    isGameOver: boolean;
    showEval: boolean;
    onToggleEval: () => void;
}

const Controls: React.FC<ControlsProps> = ({ 
    onNewGame, 
    isGameOver, 
    showEval, 
    onToggleEval
}) => {
    return (
        <div className="controls" data-testid="controls">
            <button
                className={`controls__button ${isGameOver ? 'controls__button--pulse' : ''}`}
                onClick={onNewGame}
                data-testid="new-game-button"
            >
                {isGameOver ? '🎮 New Game' : '🔄 Restart'}
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
