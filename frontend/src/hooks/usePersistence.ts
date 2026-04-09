import { useCallback } from 'react';
import { Chess } from 'chess.js';
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
const INITIAL_FEN = new Chess().fen();

function isGameMode(value: unknown): value is GameMode {
  return value === 'pvp' || value === 'bot' || value === 'polgar' || value === 'endgame';
}

function isResumableFen(fen: string): boolean {
  try {
    const chess = new Chess(fen);
    return fen !== INITIAL_FEN && !chess.isGameOver();
  } catch {
    return false;
  }
}

function parseSavedState(saved: string): GameState | null {
  const parsed = JSON.parse(saved) as Partial<GameState> | null;
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.fen !== 'string' || !isResumableFen(parsed.fen)) return null;
  if (!isGameMode(parsed.mode)) return null;
  if (parsed.playerColor !== 'w' && parsed.playerColor !== 'b') return null;

  return {
    fen: parsed.fen,
    mode: parsed.mode,
    playerColor: parsed.playerColor,
    skillLevel: typeof parsed.skillLevel === 'number' ? parsed.skillLevel : 10,
    currentPuzzle: parsed.currentPuzzle ?? null,
    puzzleStep: typeof parsed.puzzleStep === 'number' ? parsed.puzzleStep : 0,
    endgameInfo: parsed.endgameInfo ?? null,
    selectedPolgarType: typeof parsed.selectedPolgarType === 'string' ? parsed.selectedPolgarType : 'Mate in One',
    selectedEndgameLevel: typeof parsed.selectedEndgameLevel === 'string' ? parsed.selectedEndgameLevel : 'beginner_class_d',
  };
}

export function usePersistence() {
  const saveState = useCallback((state: GameState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, []);

  const loadState = useCallback((): GameState | null => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    try {
      const parsed = parseSavedState(saved);
      if (!parsed) {
        localStorage.removeItem(STORAGE_KEY);
      }
      return parsed;
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
