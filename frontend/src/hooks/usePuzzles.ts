import { useState, useCallback, useEffect } from 'react';
import { reportPuzzleResult, getPuzzleStats } from '../engine/eval';
import type { Puzzle, PuzzleStats } from '../engine/eval';
import type { Square, PieceType, MoveResult } from '../engine/types';

interface PuzzleProps {
  currentPuzzle: Puzzle | null;
  puzzleStep: number;
  setPuzzleStep: (step: number | ((prev: number) => number)) => void;
  syncState: () => void;
  makeMove: (from: Square, to: Square, promotion?: PieceType) => MoveResult;
  enabled: boolean;
}

export function usePuzzles({ 
  currentPuzzle, 
  puzzleStep, 
  setPuzzleStep, 
  syncState, 
  makeMove,
  enabled,
}: PuzzleProps) {
  const [puzzleFeedback, setPuzzleFeedback] = useState<string | null>(null);
  const [puzzleStats, setPuzzleStats] = useState<PuzzleStats | null>(null);

  const fetchPuzzleStats = useCallback(async () => {
    if (!enabled) {
      setPuzzleStats(null);
      return;
    }
    const stats = await getPuzzleStats();
    setPuzzleStats(stats);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    (async () => {
      const stats = await getPuzzleStats();
      if (active) setPuzzleStats(stats);
    })();

    return () => { active = false; };
  }, [enabled]);

  const handlePuzzleMove = useCallback(async (from: Square, to: Square) => {
    if (!currentPuzzle) return;

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
          await reportPuzzleResult(currentPuzzle.id, true);
          fetchPuzzleStats();
        } else {
          setPuzzleFeedback('✨ Good move! Keep going...');
        }
      }
    } else {
      setPuzzleFeedback('❌ Wrong move. Try again!');
      await reportPuzzleResult(currentPuzzle.id, false);
      fetchPuzzleStats();
    }
  }, [currentPuzzle, puzzleStep, makeMove, syncState, setPuzzleStep, fetchPuzzleStats]);

  return {
    puzzleFeedback,
    setPuzzleFeedback,
    puzzleStats: enabled ? puzzleStats : null,
    fetchPuzzleStats,
    handlePuzzleMove
  };
}
