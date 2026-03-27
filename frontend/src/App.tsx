import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Board from './components/Board';
import GameStatus from './components/GameStatus';
import MoveHistory from './components/MoveHistory';
import PromotionDialog from './components/PromotionDialog';
import Controls from './components/Controls';
import EvalBar from './components/EvalBar';
import GameMenu from './components/GameMenu';
import type { GameMode } from './components/GameMenu';
import { 
  getStockfishEvaluation, 
  getPolgarPuzzle, 
  getEndgamePosition,
} from './engine/eval';
import type { EndgamePosition } from './engine/eval';
import type { Square, PieceType } from './engine/types';
import './App.css';

// Hooks
import { useChessGame } from './hooks/useChessGame';
import { usePersistence } from './hooks/usePersistence';
import type { GameState } from './hooks/usePersistence';
import { useBot } from './hooks/useBot';
import { usePuzzles } from './hooks/usePuzzles';

interface PendingPromotion {
  from: Square;
  to: Square;
}

function App() {
  const { loadState, saveState, clearState } = usePersistence();
  const initialData = loadState();

  const {
    game,
    board,
    status,
    history,
    selectedSquare,
    setSelectedSquare,
    legalMoves,
    setLegalMoves,
    lastMove,
    setLastMove,
    syncState,
    resetGame,
    loadGame,
    makeMove,
    getKingInCheckSquare
  } = useChessGame();

  const [isSetup, setIsSetup] = useState(!initialData);
  const [gameMode, setGameMode] = useState<GameMode>(initialData?.mode || 'pvp');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>(initialData?.playerColor || 'w');
  const [skillLevel, setSkillLevel] = useState(initialData?.skillLevel || 10);
  
  const [currentPuzzle, setCurrentPuzzle] = useState(initialData?.currentPuzzle || null);
  const [puzzleStep, setPuzzleStep] = useState(initialData?.puzzleStep || 0);
  const [endgameInfo, setEndgameInfo] = useState<EndgamePosition | null>(initialData?.endgameInfo || null);
  const [selectedPolgarType, setSelectedPolgarType] = useState<string>(initialData?.selectedPolgarType || 'Mate in One');

  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [showEval, setShowEval] = useState(false);
  const [stockfishEval, setStockfishEval] = useState<{ score: number, mate: number | null }>({ score: 0, mate: null });

  // Initial load
  useEffect(() => {
    if (initialData?.fen) {
      loadGame(initialData.fen);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { puzzleFeedback, setPuzzleFeedback, puzzleStats, handlePuzzleMove } = usePuzzles({
    currentPuzzle,
    puzzleStep,
    setPuzzleStep,
    syncState,
    makeMove,
  });

  const onBotMove = useCallback((from: Square, to: Square, promotion?: PieceType) => {
    const result = makeMove(from, to, promotion);
    if (result.success) {
      setLastMove({ from, to });
    }
  }, [makeMove, setLastMove]);

  const { isBotThinking } = useBot({
    game,
    isSetup,
    gameMode,
    playerColor,
    skillLevel,
    status,
    onBotMove
  });

  // Persistence: Save state
  useEffect(() => {
    if (!isSetup) {
      const state: GameState = {
        fen: game.fen(),
        mode: gameMode,
        playerColor,
        skillLevel,
        currentPuzzle,
        puzzleStep,
        endgameInfo,
        selectedPolgarType
      };
      saveState(state);
    }
  }, [history, isSetup, gameMode, playerColor, skillLevel, currentPuzzle, puzzleStep, endgameInfo, selectedPolgarType, saveState, game]);

  // Trigger evaluation whenever history changes
  useEffect(() => {
    if (showEval) {
      const fetchEval = async () => {
        const result = await getStockfishEvaluation(game.fen());
        setStockfishEval(result);
      };
      fetchEval();
    }
  }, [history, showEval, game]);

  // Auto-hide feedback after 5 seconds
  useEffect(() => {
    if (puzzleFeedback && !puzzleFeedback.includes('✅')) {
      const timer = setTimeout(() => setPuzzleFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [puzzleFeedback, setPuzzleFeedback]);

  const handleSquareClick = useCallback(
    async (square: Square) => {
      if (game.isGameOver()) return;

      const boardData = game.getBoard();
      const file = square.charCodeAt(0) - 97;
      const rank = 8 - parseInt(square[1]);
      const clickedPiece = boardData[rank][file];

      if (selectedSquare) {
        if (square === selectedSquare) {
          setSelectedSquare(null);
          setLegalMoves([]);
          return;
        }

        if (clickedPiece && clickedPiece.color === game.turn()) {
          const moves = game.getLegalMoves(square);
          setSelectedSquare(square);
          setLegalMoves(moves);
          return;
        }

        if (legalMoves.includes(square)) {
          if (game.needsPromotion(selectedSquare, square)) {
            setPendingPromotion({ from: selectedSquare, to: square });
            return;
          }

          if (gameMode === 'polgar' && currentPuzzle) {
            await handlePuzzleMove(selectedSquare, square);
            return;
          }

          makeMove(selectedSquare, square);
          return;
        }

        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      if (clickedPiece && clickedPiece.color === game.turn()) {
        const moves = game.getLegalMoves(square);
        setSelectedSquare(square);
        setLegalMoves(moves);
      }
    },
    [selectedSquare, legalMoves, currentPuzzle, gameMode, game, handlePuzzleMove, makeMove, setLegalMoves, setSelectedSquare]
  );

  const handleDrop = useCallback(
    (source: Square, target: Square) => {
      if (game.isGameOver()) return;

      const boardData = game.getBoard();
      const file = source.charCodeAt(0) - 97;
      const rank = 8 - parseInt(source[1]);
      const draggedPiece = boardData[rank][file];

      if (!draggedPiece || draggedPiece.color !== game.turn()) return;
      if ((gameMode === 'bot' || gameMode === 'endgame') && game.turn() !== playerColor) return;

      const moves = game.getLegalMoves(source);
      if (moves.includes(target)) {
        if (game.needsPromotion(source, target)) {
          setSelectedSquare(source);
          setLegalMoves(moves);
          setPendingPromotion({ from: source, to: target });
          return;
        }

        makeMove(source, target);
      }
    },
    [gameMode, playerColor, game, makeMove, setLegalMoves, setSelectedSquare]
  );

  const handlePromotion = useCallback(
    (pieceType: PieceType) => {
      if (!pendingPromotion) return;
      makeMove(pendingPromotion.from, pendingPromotion.to, pieceType);
      setPendingPromotion(null);
    },
    [pendingPromotion, makeMove]
  );

  const handleStartGame = async (mode: GameMode, color: 'w' | 'b', level: number, polgarType?: string) => {
    setGameMode(mode);
    setPlayerColor(color);
    setSkillLevel(level);
    setIsSetup(false);
    setPuzzleFeedback(null);
    setPuzzleStep(0);
    setEndgameInfo(null);
    if (polgarType) setSelectedPolgarType(polgarType);
    
    if (mode === 'polgar') {
      try {
        const puzzle = await getPolgarPuzzle(polgarType);
        if (puzzle) {
          setCurrentPuzzle(puzzle);
          loadGame(puzzle.fen);
          setPlayerColor(game.turn());
        }
      } catch (err) {
        setPuzzleFeedback(`⚠️ ${err instanceof Error ? err.message : 'Error fetching puzzle'}`);
        setIsSetup(true); // Go back to menu
        return;
      }
    } else if (mode === 'endgame') {
      const endgame = await getEndgamePosition();
      if (endgame) {
        setEndgameInfo(endgame);
        loadGame(endgame.fen);
        setPlayerColor(endgame.side);
      }
    } else {
      setCurrentPuzzle(null);
      resetGame();
    }
  };

  const handleNextPuzzle = async () => {
    if (gameMode === 'endgame') {
      const endgame = await getEndgamePosition();
      if (endgame) {
        setEndgameInfo(endgame);
        loadGame(endgame.fen);
        setPlayerColor(endgame.side);
      }
      return;
    }
    try {
      const puzzle = await getPolgarPuzzle(selectedPolgarType);
      if (puzzle) {
        setCurrentPuzzle(puzzle);
        setPuzzleStep(0);
        setPuzzleFeedback(null);
        loadGame(puzzle.fen);
        setPlayerColor(game.turn());
      }
    } catch (err) {
      setPuzzleFeedback(`⚠️ ${err instanceof Error ? err.message : 'Error fetching puzzle'}`);
      setIsSetup(true);
    }
  };

  const handleNewGame = useCallback(() => {
    setIsSetup(true);
    clearState();
    resetGame();
  }, [clearState, resetGame]);

  const handleToggleEval = useCallback(() => {
    setShowEval((prev) => !prev);
  }, []);

  const { user, loading, logout } = useAuth();

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">♔ Chess</h1>
        <div className="app__header-right">
          {!isSetup && (
            <button className="back-to-menu-btn" onClick={() => setIsSetup(true)}>
              ⬅️ Menu
            </button>
          )}
          <div className="user-pill">
            {user.avatar && (
              <img className="user-avatar" src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />
            )}
            <span className="user-name">{user.name.split(' ')[0]}</span>
            <button className="logout-btn" onClick={logout} title="Sign out">↩</button>
          </div>
        </div>
      </header>

      <main className="app__main">
        {puzzleFeedback && (
          <div className={`puzzle-feedback ${puzzleFeedback.includes('✅') ? 'success' : (puzzleFeedback.includes('⚠️') ? 'info' : 'error')}`} style={{ position: 'relative', top: '0', marginBottom: '16px', left: 'auto', transform: 'none' }}>
            {puzzleFeedback}
          </div>
        )}
        {isSetup ? (
          <GameMenu onStartGame={handleStartGame} />
        ) : (
          <div className="app__game-area">
            <div className="app__board-section">
              <div style={{ position: 'relative' }}>
                <GameStatus status={status} />
                {isBotThinking && <div className="bot-thinking">🤖 Stockfish is thinking...</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'row' }}>
                <EvalBar score={stockfishEval} show={showEval} />
                <Board
                  board={board}
                  selectedSquare={selectedSquare}
                  legalMoves={legalMoves}
                  lastMove={lastMove}
                  kingInCheck={getKingInCheckSquare()}
                  isFlipped={gameMode === 'pvp' ? game.turn() === 'b' : playerColor === 'b'}
                  onSquareClick={(sq) => ((gameMode === 'bot' || gameMode === 'endgame') && game.turn() !== playerColor && !isBotThinking) ? null : handleSquareClick(sq)}
                  onDropPiece={(s, t) => ((gameMode === 'bot' || gameMode === 'endgame') && game.turn() !== playerColor && !isBotThinking) ? null : handleDrop(s, t)}
                />
              </div>
              <div className="app__controls-container">
                  <Controls 
                      onNewGame={handleNewGame} 
                      isGameOver={game.isGameOver()} 
                      showEval={showEval}
                      onToggleEval={handleToggleEval}
                  />
                  { (gameMode === 'polgar' || gameMode === 'endgame') && (
                    <button className="next-puzzle-btn" onClick={handleNextPuzzle}>
                      {gameMode === 'endgame' ? 'Next Endgame ➡️' : 'Next Puzzle ➡️'}
                    </button>
                  )}
              </div>
            </div>

            <aside className="app__sidebar">
              {endgameInfo && (
                <div className="endgame-info">
                  <h3>{endgameInfo.name}</h3>
                  <p>{endgameInfo.description}</p>
                </div>
              )}
              {puzzleStats && (
                <div className="endgame-info statistics-card">
                  <h3>Statistics</h3>
                  <div className="stats-grid">
                    {currentPuzzle?.categoryTotal !== undefined && (
                      <div className="stat-item highlight">
                        <span className="stat-label">🎯 Category Progress</span>
                        <span className="stat-value">{currentPuzzle.categoryTotal - (currentPuzzle.categoryRemaining || 0)} / {currentPuzzle.categoryTotal}</span>
                        <div className="category-progress-bar">
                          <div 
                            className="category-progress-fill" 
                            style={{ width: `${((currentPuzzle.categoryTotal - (currentPuzzle.categoryRemaining || 0)) / currentPuzzle.categoryTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {gameMode === 'polgar' && currentPuzzle && (
                      <div className="stat-item">
                        <span className="stat-label">🔢 Puzzle #</span>
                        <span className="stat-value">{currentPuzzle.id}</span>
                      </div>
                    )}
                    <div className="stat-item">
                      <span className="stat-label">📈 Success</span>
                      <span className="stat-value">{puzzleStats.successRate}%</span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">🧩 Total</span>
                      <span className="stat-value">{puzzleStats.totalPuzzlesTouched}</span>
                    </div>
                    {puzzleStats.dueReviewCount > 0 && (
                      <div className="stat-item due">
                        <span className="stat-label">🔔 Due</span>
                        <span className="stat-value">{puzzleStats.dueReviewCount}</span>
                      </div>
                    )}
                  </div>

                  <div className="forecast-section">
                    <h4>Review Forecast</h4>
                    <div className="forecast-grid">
                      {Object.entries(puzzleStats.forecast).map(([date, count], i) => {
                        const dayLabel = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
                        return (
                          <div key={date} className={`forecast-item ${count > 0 ? 'active' : ''}`}>
                            <span className="forecast-day">{dayLabel}</span>
                            <span className="forecast-count">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div className="app__sidebar-top">
                <MoveHistory history={history} />
              </div>
            </aside>
          </div>
        )}
      </main>

      {pendingPromotion && (
        <PromotionDialog
          color={game.turn() === 'w' ? 'b' : 'w'}
          onSelect={handlePromotion}
        />
      )}
    </div>
  );
}

export default App;

