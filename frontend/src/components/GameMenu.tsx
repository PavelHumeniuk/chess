import React from 'react';
import './GameMenu.css';

export type GameMode = 'pvp' | 'bot' | 'polgar' | 'endgame';

interface GameMenuProps {
    onStartGame: (mode: GameMode, playerColor: 'w' | 'b', skillLevel: number, polgarType?: string) => void;
}

const MIN_BOT_ELO = 800;
const MAX_BOT_ELO = 2800;
const ENDGAME_LEVELS = [
    { value: 'beginner_class_d', label: 'Beginner-D' },
    { value: 'class_c', label: 'Class C' },
    { value: 'class_b', label: 'Class B' },
    { value: 'class_a', label: 'Class A' },
    { value: 'experts', label: 'Expert' },
    { value: 'masters', label: 'Master' },
];

function eloToSkill(elo: number): number {
    const normalized = Math.round((elo - MIN_BOT_ELO) / 100);
    return Math.max(0, Math.min(20, normalized));
}

const GameMenu: React.FC<GameMenuProps> = ({ onStartGame }) => {
    const [mode, setMode] = React.useState<GameMode>('pvp');
    const [playerColor, setPlayerColor] = React.useState<'w' | 'b'>('w');
    const [botElo, setBotElo] = React.useState(1800);
    const [polgarType, setPolgarType] = React.useState('Mate in One');
    const [endgameLevel, setEndgameLevel] = React.useState('beginner_class_d');

    return (
        <div className="game-menu">
            <h2 className="game-menu__title">Select Game Mode</h2>
            
            <div className="game-menu__options">
                <button 
                    className={`game-menu__button ${mode === 'bot' ? 'active' : ''}`}
                    onClick={() => setMode('bot')}
                >
                    <span className="game-menu__icon">🤖</span>
                    <span>Play Bot</span>
                </button>
                <button 
                    className={`game-menu__button ${mode === 'polgar' ? 'active' : ''}`}
                    onClick={() => setMode('polgar')}
                >
                    <span className="game-menu__icon">👑</span>
                    <span>Polgar</span>
                </button>
                <button 
                    className={`game-menu__button ${mode === 'endgame' ? 'active' : ''}`}
                    onClick={() => setMode('endgame')}
                >
                    <span className="game-menu__icon">⛰️</span>
                    <span>Endgame</span>
                </button>
            </div>

            {mode === 'polgar' && (
                <div className="game-menu__bot-settings">
                    <div className="game-menu__setting">
                        <label>Select Your Challenge:</label>
                        <div className="game-menu__options">
                            <button 
                                className={`game-menu__button ${polgarType === 'Mate in One' ? 'active' : ''}`}
                                onClick={() => setPolgarType('Mate in One')}
                            >
                                Mate in 1
                            </button>
                            <button 
                                className={`game-menu__button ${polgarType === 'Mate in Two' ? 'active' : ''}`}
                                onClick={() => setPolgarType('Mate in Two')}
                            >
                                Mate in 2
                            </button>
                            <button 
                                className={`game-menu__button ${polgarType === 'Mate in Three' ? 'active' : ''}`}
                                onClick={() => setPolgarType('Mate in Three')}
                            >
                                Mate in 3
                            </button>
                            <button 
                                className={`game-menu__button ${polgarType === 'Review Due' ? 'active' : ''}`}
                                onClick={() => setPolgarType('Review Due')}
                            >
                                Review Due
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {mode === 'bot' && (
                <div className="game-menu__bot-settings">
                    <div className="game-menu__setting">
                        <label>Your Color:</label>
                        <div className="game-menu__color-select">
                            <button 
                                className={`color-btn white ${playerColor === 'w' ? 'selected' : ''}`}
                                onClick={() => setPlayerColor('w')}
                            >
                                White
                            </button>
                            <button 
                                className={`color-btn black ${playerColor === 'b' ? 'selected' : ''}`}
                                onClick={() => setPlayerColor('b')}
                            >
                                Black
                            </button>
                        </div>
                    </div>
                    
                    <div className="game-menu__setting">
                        <label>Bot ELO (approx): {botElo}</label>
                        <input 
                            type="range" 
                            min={MIN_BOT_ELO}
                            max={MAX_BOT_ELO}
                            step="100"
                            value={botElo}
                            onChange={(e) => setBotElo(Number(e.target.value))}
                            className="game-menu__slider"
                        />
                    </div>
                </div>
            )}

            {mode === 'endgame' && (
                <div className="game-menu__bot-settings">
                    <div className="game-menu__setting">
                        <label>Select Silman Level:</label>
                        <div className="game-menu__options">
                            {ENDGAME_LEVELS.map(({ value, label }) => (
                                <button
                                    key={value}
                                    className={`game-menu__button ${endgameLevel === value ? 'active' : ''}`}
                                    onClick={() => setEndgameLevel(value)}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <button 
                className="game-menu__start-btn"
                onClick={() => onStartGame(
                    mode,
                    playerColor,
                    eloToSkill(botElo),
                    mode === 'polgar' ? polgarType : mode === 'endgame' ? endgameLevel : undefined,
                )}
            >
                Start Game
            </button>
        </div>
    );
};

export default GameMenu;
