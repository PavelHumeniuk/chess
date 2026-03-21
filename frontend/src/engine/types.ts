import type { Square as ChessSquare, PieceSymbol, Color } from 'chess.js';

export type Square = ChessSquare;
export type PieceType = PieceSymbol;
export type PieceColor = Color;

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export type GameStatus =
  | { state: 'playing'; turn: PieceColor }
  | { state: 'check'; turn: PieceColor }
  | { state: 'checkmate'; winner: PieceColor }
  | { state: 'stalemate' }
  | { state: 'draw'; reason: string };

export interface MoveResult {
  success: boolean;
  san?: string;
  captured?: Piece;
  promotion?: boolean;
}

export interface BoardSquare {
  square: Square;
  piece: Piece | null;
}

export type Board = (Piece | null)[][];
