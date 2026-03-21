import { useState, useEffect } from 'react';
import { getStockfishBestMove } from '../engine/eval';
import type { GameMode } from '../components/GameMenu';
import type { Square, PieceType } from '../engine/types';
import type { ChessGame } from '../engine/ChessGame';

interface BotProps {
  game: ChessGame;
  isSetup: boolean;
  gameMode: GameMode;
  playerColor: 'w' | 'b';
  skillLevel: number;
  onBotMove: (from: Square, to: Square, promotion?: PieceType) => void;
}

export function useBot({ game, isSetup, gameMode, playerColor, skillLevel, onBotMove }: BotProps) {
  const [isBotThinking, setIsBotThinking] = useState(false);

  useEffect(() => {
    if (!game) return;
    
    if (!isSetup && (gameMode === 'bot' || gameMode === 'endgame') && game.turn() !== playerColor && !game.isGameOver() && !isBotThinking) {
      const makeBotMove = async () => {
        setIsBotThinking(true);
        // Wait a bit for "thinking" effect
        await new Promise(r => setTimeout(r, 600));
        
        const bestMoveUCI = await getStockfishBestMove(game.fen(), 12, skillLevel);
        if (bestMoveUCI) {
          const from = bestMoveUCI.slice(0, 2) as Square;
          const to = bestMoveUCI.slice(2, 4) as Square;
          const promotion = bestMoveUCI.length > 4 ? bestMoveUCI[4] as PieceType : undefined;
          
          onBotMove(from, to, promotion);
        }
        setIsBotThinking(false);
      };
      makeBotMove();
    }
  }, [game, isSetup, gameMode, playerColor, skillLevel, isBotThinking, onBotMove]);

  return { isBotThinking };
}
