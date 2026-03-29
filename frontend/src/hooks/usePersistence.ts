import { useCallback } from 'react';
import type { GameMode } from '../components/GameMenu';
import type { Puzzle, EndgamePosition } from '../engine/eval';

export interface GameState {
  fen: string;
  mode: GameMode;
  playerColor: 'w' | 'b';
  skillLevel: number;
  currentPuzzle: Puzzle | null;
  puzzleStep: number;
  endgameInfo: EndgamePosition | null;
  selectedPolgarType: string;
  selectedEndgameLevel: string;
}

const STORAGE_KEY = 'chess_game_state';

export function usePersistence() {
  const saveState = useCallback((state: GameState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, []);

  const loadState = useCallback((): GameState | null => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    try {
      return JSON.parse(saved) as GameState;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }, []);

  const clearState = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { saveState, loadState, clearState };
}
