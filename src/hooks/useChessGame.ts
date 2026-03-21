import { useState, useCallback } from 'react';
import { ChessGame } from '../engine/ChessGame';
import type { Square, PieceType, GameStatus, Board as BoardData } from '../engine/types';

export function useChessGame() {
  const [game] = useState(() => new ChessGame());
  
  const [board, setBoard] = useState<BoardData>(() => game.getBoard());
  const [status, setStatus] = useState<GameStatus>(() => game.getStatus());
  const [history, setHistory] = useState<string[]>(() => game.history());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);

  const syncState = useCallback(() => {
    setBoard(game.getBoard());
    setStatus(game.getStatus());
    setHistory([...game.history()]);
  }, [game]);

  const resetGame = useCallback(() => {
    game.reset();
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);
    syncState();
  }, [game, syncState]);

  const loadGame = useCallback((fen: string) => {
    game.load(fen);
    syncState();
  }, [game, syncState]);

  const makeMove = useCallback((from: Square, to: Square, promotion?: PieceType) => {
    const result = game.makeMove(from, to, promotion);
    if (result.success) {
      setLastMove({ from, to });
      setSelectedSquare(null);
      setLegalMoves([]);
      syncState();
      return result;
    }
    return result;
  }, [game, syncState]);

  const getKingInCheckSquare = useCallback((): Square | null => {
    const st = game.getStatus();
    if (st.state === 'check') {
      return game.getKingSquare(st.turn);
    }
    if (st.state === 'checkmate') {
      const loser = st.winner === 'w' ? 'b' : 'w';
      return game.getKingSquare(loser);
    }
    return null;
  }, [game]);

  return {
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
  };
}
