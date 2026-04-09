import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import GameHistory from './pages/GameHistory';
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
  getStockfishBestMove,
  getPolgarPuzzle, 
  getEndgamePosition,
  reportPuzzleResult,
  saveGame,
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
import { getEndgameTheory } from './endgameTheory';

interface PendingPromotion {
  from: Square;
  to: Square;
}

const MIN_SAVED_GAME_MOVES = 5;

function normalizeEvalForWhite(fen: string, score: number, mate: number | null) {
  const multiplier = fen.split(' ')[1] === 'b' ? -1 : 1;
  return {
    score: score * multiplier,
    mate: mate !== null ? mate * multiplier : null,
  };
}

function App() {
  const { loadState, saveState, clearState } = usePersistence();
  const { user, loading, logout } = useAuth();
  const [initialData] = useState<GameState | null>(() => loadState());

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
  const [appView, setAppView] = useState<'menu' | 'game' | 'history'>(!initialData ? 'menu' : 'game');
  const [gameMode, setGameMode] = useState<GameMode>(initialData?.mode || 'pvp');
  const [playerColor, setPlayerColor] = useState<'w' | 'b'>(initialData?.playerColor || 'w');
  const [skillLevel, setSkillLevel] = useState(initialData?.skillLevel || 10);
  const [botElo, setBotElo] = useState(1800);
  const gameSavedRef = useRef(false);
  
  const [currentPuzzle, setCurrentPuzzle] = useState(initialData?.currentPuzzle || null);
  const [puzzleStep, setPuzzleStep] = useState(initialData?.puzzleStep || 0);
  const [endgameInfo, setEndgameInfo] = useState<EndgamePosition | null>(initialData?.endgameInfo || null);
  const [selectedPolgarType, setSelectedPolgarType] = useState<string>(initialData?.selectedPolgarType || 'Mate in One');
  const [selectedEndgameLevel, setSelectedEndgameLevel] = useState<string>(initialData?.selectedEndgameLevel || 'beginner_class_d');

  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [showEval, setShowEval] = useState(false);
  const [stockfishEval, setStockfishEval] = useState<{ score: number, mate: number | null }>({ score: 0, mate: null });
  const [hintText, setHintText] = useState<string | null>(null);
  const [isHintLoading, setIsHintLoading] = useState(false);
  const [showEndgameTheory, setShowEndgameTheory] = useState(false);
  const reportedEndgameResult = useRef<string | null>(null);
  const activeSessionRef = useRef(0);
  const [sessionKey, setSessionKey] = useState(0);

  const sideToMoveFromFen = useCallback((fen: string): 'w' | 'b' => (
    fen.split(' ')[1] === 'b' ? 'b' : 'w'
  ), []);

  const beginSession = useCallback(() => {
    const next = activeSessionRef.current + 1;
    activeSessionRef.current = next;
    setSessionKey(next);
    return next;
  }, []);

  const isSessionCurrent = useCallback((key: number) => activeSessionRef.current === key, []);

  // Initial load
  useEffect(() => {
    if (initialData?.fen) {
      loadGame(initialData.fen);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { puzzleFeedback, setPuzzleFeedback, puzzleStats, fetchPuzzleStats, handlePuzzleMove, isPuzzleReplying, isPuzzleResolved, resetPuzzleState } = usePuzzles({
    currentPuzzle,
    puzzleStep,
    setPuzzleStep,
    syncState,
    makeMove,
    enabled: !!user && !loading && !isSetup && (gameMode === 'polgar' || gameMode === 'endgame'),
    kind: gameMode === 'endgame' ? 'endgame' : gameMode === 'polgar' ? 'polgar' : undefined,
    game,
    sessionKey,
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
    positionKey: game.fen(),
    onBotMove,
    sessionKey,
  });

  // Persistence: Save state
  useEffect(() => {
    if (isSetup || game.isGameOver() || history.length === 0) {
      clearState();
      return;
    }

    const state: GameState = {
      fen: game.fen(),
      mode: gameMode,
      playerColor,
      skillLevel,
      currentPuzzle,
      puzzleStep,
      endgameInfo,
      selectedPolgarType,
      selectedEndgameLevel
    };
    saveState(state);
  }, [history, isSetup, gameMode, playerColor, skillLevel, currentPuzzle, puzzleStep, endgameInfo, selectedPolgarType, selectedEndgameLevel, saveState, clearState, game]);

  // Trigger evaluation whenever history changes
  useEffect(() => {
    if (showEval) {
      const fetchEval = async () => {
        const fen = game.fen();
        const result = await getStockfishEvaluation(fen);
        setStockfishEval(normalizeEvalForWhite(fen, result.score, result.mate));
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

  useEffect(() => {
    reportedEndgameResult.current = null;
    setShowEndgameTheory(false);
  }, [endgameInfo?.id]);

  useEffect(() => {
    if (gameMode !== 'endgame' || !endgameInfo || !user) return;

    const terminal = status.state === 'checkmate' || status.state === 'stalemate' || status.state === 'draw';
    if (!terminal) return;

    const reportKey = `${endgameInfo.id}:${status.state}:${status.state === 'checkmate' ? status.winner : 'none'}`;
    if (reportedEndgameResult.current === reportKey) return;
    reportedEndgameResult.current = reportKey;

    const didWin = status.state === 'checkmate' && status.winner === playerColor;

    setPuzzleFeedback(didWin ? '✅ Endgame solved. Added to your repetition stats.' : '❌ Endgame failed. Restart it and try again.');
    void reportPuzzleResult(endgameInfo.id, didWin).then(() => fetchPuzzleStats());
  }, [gameMode, endgameInfo, playerColor, status, user, setPuzzleFeedback, fetchPuzzleStats]);

  // Auto-save completed bot games
  useEffect(() => {
    if (gameMode !== 'bot' || isSetup || !user) return;
    const isOver = status.state === 'checkmate' || status.state === 'stalemate' || status.state === 'draw';
    if (!isOver || gameSavedRef.current) return;
    gameSavedRef.current = true;

    const moves = game.history();
    if (moves.length < MIN_SAVED_GAME_MOVES) {
      return;
    }

    let result: 'win' | 'loss' | 'draw';
    if (status.state === 'checkmate') {
      result = status.winner === playerColor ? 'win' : 'loss';
    } else {
      result = 'draw';
    }
    void saveGame({ botRating: botElo, playerColor, result, moves });
  }, [status, gameMode, isSetup, user, playerColor, botElo, game]);

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

  const handleStartGame = async (mode: GameMode, color: 'w' | 'b', level: number, elo: number, polgarType?: string) => {
    const session = beginSession();
    setGameMode(mode);
    setPlayerColor(color);
    setSkillLevel(level);
    setBotElo(elo);
    gameSavedRef.current = false;
    setIsSetup(false);
    setAppView('game');
    setPuzzleFeedback(null);
    setHintText(null);
    setPuzzleStep(0);
    setEndgameInfo(null);
    setCurrentPuzzle(null);
    resetPuzzleState();
    
    if (mode === 'polgar') {
      if (polgarType) setSelectedPolgarType(polgarType);
      try {
        const puzzle = await getPolgarPuzzle(polgarType);
        if (!isSessionCurrent(session)) return;
        if (puzzle) {
          setCurrentPuzzle(puzzle);
          loadGame(puzzle.fen);
          setPlayerColor(sideToMoveFromFen(puzzle.fen));
          setHintText(null);
        }
      } catch (err) {
        if (!isSessionCurrent(session)) return;
        setPuzzleFeedback(`⚠️ ${err instanceof Error ? err.message : 'Error fetching puzzle'}`);
        setIsSetup(true); // Go back to menu
        return;
      }
    } else if (mode === 'endgame') {
      const endgameLevel = polgarType || selectedEndgameLevel;
      setSelectedEndgameLevel(endgameLevel);
      try {
        const endgame = await getEndgamePosition(endgameLevel);
        if (!isSessionCurrent(session)) return;
        setEndgameInfo(endgame);
        loadGame(endgame.fen);
        setPlayerColor(endgame.side);
        setHintText(null);
      } catch (err) {
        if (!isSessionCurrent(session)) return;
        setPuzzleFeedback(`⚠️ ${err instanceof Error ? err.message : 'Error fetching endgame'}`);
        setIsSetup(true);
        return;
      }
    } else {
      setHintText(null);
      resetGame();
    }
  };

  const handleNextPuzzle = async () => {
    const session = beginSession();
    resetPuzzleState();
    setHintText(null);

    if (gameMode === 'endgame') {
      try {
        const endgame = await getEndgamePosition(selectedEndgameLevel);
        if (!isSessionCurrent(session)) return;
        setEndgameInfo(endgame);
        loadGame(endgame.fen);
        setPlayerColor(endgame.side);
      } catch (err) {
        if (!isSessionCurrent(session)) return;
        setPuzzleFeedback(`⚠️ ${err instanceof Error ? err.message : 'Error fetching endgame'}`);
        setIsSetup(true);
      }
      return;
    }
    try {
      const puzzle = await getPolgarPuzzle(selectedPolgarType);
      if (!isSessionCurrent(session)) return;
      if (puzzle) {
        setCurrentPuzzle(puzzle);
        setPuzzleStep(0);
        resetPuzzleState();
        setHintText(null);
        loadGame(puzzle.fen);
        setPlayerColor(sideToMoveFromFen(puzzle.fen));
      }
    } catch (err) {
      if (!isSessionCurrent(session)) return;
      setPuzzleFeedback(`⚠️ ${err instanceof Error ? err.message : 'Error fetching puzzle'}`);
      setIsSetup(true);
    }
  };

  const handleNewGame = useCallback(() => {
    beginSession();
    resetPuzzleState();
    setIsSetup(true);
    setAppView('menu');
    gameSavedRef.current = false;
    setHintText(null);
    clearState();
    resetGame();
  }, [beginSession, clearState, resetGame, resetPuzzleState]);

  const handleRestartTrainingPosition = useCallback(() => {
    beginSession();
    setHintText(null);
    setPuzzleStep(0);
    resetPuzzleState();

    if (gameMode === 'polgar' && currentPuzzle) {
      loadGame(currentPuzzle.fen);
      setPlayerColor(sideToMoveFromFen(currentPuzzle.fen));
      return;
    }

    if (gameMode === 'endgame' && endgameInfo) {
      loadGame(endgameInfo.fen);
      setPlayerColor(endgameInfo.side);
      return;
    }

    resetGame();
  }, [beginSession, gameMode, currentPuzzle, endgameInfo, loadGame, resetGame, resetPuzzleState, sideToMoveFromFen]);

  const handleHint = useCallback(async () => {
    if (gameMode !== 'polgar' || !currentPuzzle) return;
    setIsHintLoading(true);
    try {
      const bestMoveUci = await getStockfishBestMove(game.fen(), 12, 20);
      if (!bestMoveUci) {
        setHintText('No hint available');
        return;
      }
      const san = game.getSanForUci(bestMoveUci);
      setHintText(san || bestMoveUci);
    } catch {
      setHintText('No hint available');
    } finally {
      setIsHintLoading(false);
    }
  }, [gameMode, currentPuzzle, game]);

  const handleToggleEval = useCallback(() => {
    setShowEval((prev) => !prev);
  }, []);

  const handleToggleEndgameTheory = useCallback(() => {
    setShowEndgameTheory((prev) => !prev);
  }, []);

  const handleLogout = useCallback(() => {
    beginSession();
    resetPuzzleState();
    clearState();
    logout();
  }, [beginSession, clearState, logout, resetPuzzleState]);

  const handleBackToMenu = useCallback(() => {
    beginSession();
    resetPuzzleState();
    setHintText(null);
    setIsSetup(true);
    setAppView('menu');
  }, [beginSession, resetPuzzleState]);

  if (loading) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!user) {
    return <LoginPage />;
  }

  const isMateLinePuzzle = gameMode === 'polgar' && (currentPuzzle?.themes.includes('Mate in Two') || currentPuzzle?.themes.includes('Mate in Three'));
  const isTrainingLocked = (isMateLinePuzzle && (isPuzzleReplying || isPuzzleResolved || game.turn() !== playerColor))
    || ((gameMode === 'bot' || gameMode === 'endgame') && game.turn() !== playerColor);
  const endgameTheory = getEndgameTheory(endgameInfo);
  const isReviewDueEndgame = gameMode === 'endgame' && selectedEndgameLevel === 'review_due';

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title">♔ Chess</h1>
        <div className="app__header-right">
          {appView === 'game' && (
            <button className="back-to-menu-btn" onClick={handleBackToMenu}>
              ⬅️ Menu
            </button>
          )}
          {(appView === 'menu' || appView === 'history') && (
            <button
              className={`back-to-menu-btn${appView === 'history' ? ' active' : ''}`}
              onClick={() => setAppView(appView === 'history' ? 'menu' : 'history')}
            >
              {appView === 'history' ? '⬅️ Menu' : '📋 History'}
            </button>
          )}
          <div className="user-pill">
            {user.avatar && (
              <img className="user-avatar" src={user.avatar} alt={user.name} referrerPolicy="no-referrer" />
            )}
            <span className="user-name">{user.name.split(' ')[0]}</span>
            <button className="logout-btn" onClick={handleLogout} title="Sign out">↩</button>
          </div>
        </div>
      </header>

      <main className="app__main">
        {puzzleFeedback && (
          <div className={`puzzle-feedback ${puzzleFeedback.includes('✅') ? 'success' : (puzzleFeedback.includes('⚠️') ? 'info' : 'error')}`}>
            {puzzleFeedback}
          </div>
        )}
        {appView === 'history' ? (
          <GameHistory />
        ) : isSetup ? (
          <GameMenu onStartGame={handleStartGame} />
        ) : (
          <div className="app__game-area">
            <div className="app__board-section">
              <div style={{ position: 'relative' }}>
                <GameStatus status={status} />
                {isBotThinking && <div className="bot-thinking">🤖 Stockfish is thinking...</div>}
                {isPuzzleReplying && <div className="bot-thinking">🤖 Stockfish is choosing Black&apos;s defense...</div>}
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
                  onSquareClick={(sq) => isTrainingLocked ? null : handleSquareClick(sq)}
                  onDropPiece={(s, t) => isTrainingLocked ? null : handleDrop(s, t)}
                />
              </div>
              <div className="app__controls-container">
                  <Controls 
                      onNewGame={handleNewGame} 
                      onRestartPosition={handleRestartTrainingPosition}
                      isGameOver={game.isGameOver()} 
                      showEval={showEval}
                      onToggleEval={handleToggleEval}
                      restartMode={gameMode === 'polgar' || gameMode === 'endgame'}
                      restartLabel={gameMode === 'endgame' ? '🔄 Restart Endgame' : gameMode === 'polgar' ? '🔄 Restart Puzzle' : '🎮 New Game'}
                  />
                  { (gameMode === 'polgar' || gameMode === 'endgame') && (
                    <button className="next-puzzle-btn" onClick={handleNextPuzzle}>
                      {gameMode === 'endgame' ? 'Next Endgame ➡️' : 'Next Puzzle ➡️'}
                    </button>
                  )}
                  {gameMode === 'polgar' && (
                    <button className="next-puzzle-btn" onClick={handleHint} disabled={isHintLoading}>
                      {isHintLoading ? 'Finding Hint...' : '💡 Hint'}
                    </button>
                  )}
                  {gameMode === 'endgame' && endgameTheory && (
                    <button className="theory-btn" onClick={handleToggleEndgameTheory}>
                      {showEndgameTheory ? 'Hide Theory' : 'Show Theory'}
                    </button>
                  )}
              </div>
              {gameMode === 'polgar' && hintText && (
                <div className="puzzle-feedback info">Hint: {hintText}</div>
              )}
            </div>

            <aside className="app__sidebar">
              {endgameInfo && (
                <div className="endgame-info">
                  <h3>Endgame Description</h3>
                  <p><strong>{endgameInfo.name}</strong></p>
                  <p><strong>{endgameInfo.levelLabel}</strong></p>
                  <p>{endgameInfo.chapter}</p>
                  <p>{endgameInfo.description}</p>
                </div>
              )}
              {gameMode === 'endgame' && endgameTheory && showEndgameTheory && (
                <div className="endgame-info theory-card">
                  <h3>{endgameTheory.title}</h3>
                  <p>{endgameTheory.overview}</p>
                  <div className="theory-section">
                    <h4>Core Principles</h4>
                    <ul className="theory-list">
                      {endgameTheory.principles.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="theory-section">
                    <h4>How To Think About It</h4>
                    <ul className="theory-list">
                      {endgameTheory.method.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="theory-section">
                    <h4>Common Mistakes</h4>
                    <ul className="theory-list">
                      {endgameTheory.mistakes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {!endgameInfo && gameMode === 'endgame' && (
                <div className="endgame-info">
                  <h3>Endgame Description</h3>
                  <p>Loading endgame description...</p>
                </div>
              )}
              {puzzleStats && (
                <div className="endgame-info statistics-card">
                  <h3>Statistics</h3>
                  <div className="stats-grid">
                    {gameMode === 'polgar' && currentPuzzle?.categoryTotal !== undefined && (
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
                    {gameMode === 'endgame' && endgameInfo?.categoryTotal !== undefined && (
                      <div className="stat-item highlight">
                        <span className="stat-label">{isReviewDueEndgame ? '🎯 Due Endgames' : '🎯 Level Progress'}</span>
                        <span className="stat-value">
                          {isReviewDueEndgame
                            ? `${endgameInfo.categoryRemaining ?? endgameInfo.categoryTotal}`
                            : `${endgameInfo.categoryTotal - (endgameInfo.categoryRemaining || 0)} / ${endgameInfo.categoryTotal}`}
                        </span>
                        {!isReviewDueEndgame && (
                          <div className="category-progress-bar">
                            <div
                              className="category-progress-fill"
                              style={{ width: `${((endgameInfo.categoryTotal - (endgameInfo.categoryRemaining || 0)) / endgameInfo.categoryTotal) * 100}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {gameMode === 'endgame' && endgameInfo && (
                      <div className="stat-item">
                        <span className="stat-label">🗂 Level</span>
                        <span className="stat-value">{endgameInfo.levelLabel}</span>
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
