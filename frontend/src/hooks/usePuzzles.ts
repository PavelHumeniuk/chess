import { useState, useCallback, useEffect } from 'react';
import { reportPuzzleResult, getPuzzleStats, getStockfishBestMove } from '../engine/eval';
import type { Puzzle, PuzzleStats } from '../engine/eval';
import type { ChessGame } from '../engine/ChessGame';
import type { Square, PieceType, MoveResult } from '../engine/types';

interface PuzzleProps {
  currentPuzzle: Puzzle | null;
  puzzleStep: number;
  setPuzzleStep: (step: number | ((prev: number) => number)) => void;
  syncState: () => void;
  makeMove: (from: Square, to: Square, promotion?: PieceType) => MoveResult;
  enabled: boolean;
  kind?: 'polgar' | 'endgame';
  game: ChessGame;
}

export function usePuzzles({ 
  currentPuzzle, 
  puzzleStep, 
  setPuzzleStep, 
  syncState, 
  makeMove,
  enabled,
  kind,
  game,
}: PuzzleProps) {
  const [puzzleFeedback, setPuzzleFeedback] = useState<string | null>(null);
  const [puzzleStats, setPuzzleStats] = useState<PuzzleStats | null>(null);
  const [isPuzzleReplying, setIsPuzzleReplying] = useState(false);
  const [isPuzzleResolved, setIsPuzzleResolved] = useState(false);

  const fetchPuzzleStats = useCallback(async () => {
    if (!enabled) {
      setPuzzleStats(null);
      return;
    }
    const stats = await getPuzzleStats(kind);
    setPuzzleStats(stats);
  }, [enabled, kind]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    (async () => {
      const stats = await getPuzzleStats(kind);
      if (active) setPuzzleStats(stats);
    })();

    return () => { active = false; };
  }, [enabled, kind]);

  const resetPuzzleState = useCallback(() => {
    setPuzzleFeedback(null);
    setIsPuzzleReplying(false);
    setIsPuzzleResolved(false);
  }, []);

  const handlePuzzleMove = useCallback(async (from: Square, to: Square) => {
    if (!currentPuzzle || isPuzzleReplying || isPuzzleResolved) return;

    const mateInTheme = currentPuzzle.themes.find(theme => /^Mate in (Two|Three)$/i.test(theme));
    const allowedPlayerMoves = mateInTheme?.includes('Three') ? 3 : mateInTheme?.includes('Two') ? 2 : null;

    if (allowedPlayerMoves) {
      const result = makeMove(from, to);
      if (!result.success) return;

      const nextPlayerMoveCount = puzzleStep + 1;
      setPuzzleStep(nextPlayerMoveCount);
      syncState();

      const statusAfterPlayerMove = game.getStatus();
      if (statusAfterPlayerMove.state === 'checkmate') {
        setPuzzleFeedback('✅ Correct! Puzzle Solved.');
        setIsPuzzleResolved(true);
        await reportPuzzleResult(currentPuzzle.id, true);
        await fetchPuzzleStats();
        return;
      }

      if (nextPlayerMoveCount >= allowedPlayerMoves) {
        setPuzzleFeedback(`❌ Not mate in ${allowedPlayerMoves}. Restart and try again.`);
        setIsPuzzleResolved(true);
        await reportPuzzleResult(currentPuzzle.id, false);
        await fetchPuzzleStats();
        return;
      }

      setIsPuzzleReplying(true);
      setPuzzleFeedback('🤖 Stockfish is choosing Black\'s best defense...');
      const bestMoveUci = await getStockfishBestMove(game.fen(), 12, 20);
      if (!bestMoveUci) {
        setIsPuzzleReplying(false);
        setPuzzleFeedback('❌ Could not evaluate Black reply. Please restart.');
        setIsPuzzleResolved(true);
        await reportPuzzleResult(currentPuzzle.id, false);
        await fetchPuzzleStats();
        return;
      }

      const replyResult = makeMove(
        bestMoveUci.slice(0, 2) as Square,
        bestMoveUci.slice(2, 4) as Square,
        bestMoveUci.length > 4 ? bestMoveUci[4] as PieceType : undefined,
      );
      setIsPuzzleReplying(false);

      if (!replyResult.success) {
        setPuzzleFeedback('❌ Invalid engine reply. Please restart.');
        setIsPuzzleResolved(true);
        await reportPuzzleResult(currentPuzzle.id, false);
        await fetchPuzzleStats();
        return;
      }

      const statusAfterReply = game.getStatus();
      if (statusAfterReply.state !== 'playing' && statusAfterReply.state !== 'check') {
        setPuzzleFeedback('❌ Black escaped the mate. Restart and try again.');
        setIsPuzzleResolved(true);
        await reportPuzzleResult(currentPuzzle.id, false);
        await fetchPuzzleStats();
        return;
      }

      setPuzzleFeedback(`✨ Find mate in ${allowedPlayerMoves - nextPlayerMoveCount}.`);
      return;
    }

    const expectedMove = currentPuzzle.solution[puzzleStep];
    const moveUCI = from + to;

    if (moveUCI === expectedMove) {
      const result = makeMove(from, to);
      if (result.success) {
        const nextStep = puzzleStep + 1;
        setPuzzleStep((prev: number) => prev + 1);
        syncState();

        if (nextStep === currentPuzzle.solution.length) {
          setPuzzleFeedback('✅ Correct! Puzzle Solved.');
          setIsPuzzleResolved(true);
          await reportPuzzleResult(currentPuzzle.id, true);
          await fetchPuzzleStats();
        } else {
          setPuzzleFeedback('✨ Good move! Keep going...');
        }
      }
    } else {
      setPuzzleFeedback('❌ Wrong move. Try again!');
      setIsPuzzleResolved(true);
      await reportPuzzleResult(currentPuzzle.id, false);
      await fetchPuzzleStats();
    }
  }, [currentPuzzle, isPuzzleReplying, isPuzzleResolved, puzzleStep, makeMove, syncState, setPuzzleStep, fetchPuzzleStats, game]);

  return {
    puzzleFeedback,
    setPuzzleFeedback,
    puzzleStats: enabled ? puzzleStats : null,
    fetchPuzzleStats,
    handlePuzzleMove,
    isPuzzleReplying,
    isPuzzleResolved,
    resetPuzzleState,
  };
}
