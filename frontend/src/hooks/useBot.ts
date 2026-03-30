import { useEffect, useRef, useState } from 'react';
import { getStockfishBestMove } from '../engine/eval';
import type { GameMode } from '../components/GameMenu';
import type { Square, PieceType } from '../engine/types';
import type { ChessGame } from '../engine/ChessGame';

const ENDGAME_BOT_DEPTH = 16;
const ENDGAME_BOT_SKILL = 20;

interface BotProps {
  game: ChessGame;
  isSetup: boolean;
  gameMode: GameMode;
  playerColor: 'w' | 'b';
  skillLevel: number;
  positionKey: string;
  onBotMove: (from: Square, to: Square, promotion?: PieceType) => void;
  sessionKey: number;
}

export function useBot({ game, isSetup, gameMode, playerColor, skillLevel, positionKey, onBotMove, sessionKey }: BotProps) {
  const [isBotThinking, setIsBotThinking] = useState(false);
  const isBotThinkingRef = useRef(false);

  useEffect(() => {
    isBotThinkingRef.current = isBotThinking;
  }, [isBotThinking]);

  useEffect(() => {
    if (!game) return;

    if (isSetup || (gameMode !== 'bot' && gameMode !== 'endgame') || game.turn() === playerColor || game.isGameOver() || isBotThinkingRef.current) {
      return;
    }

    let cancelled = false;
    const fenAtRequest = positionKey;
    isBotThinkingRef.current = true;

    const makeBotMove = async () => {
      setIsBotThinking(true);
      // Wait a bit for "thinking" effect
      await new Promise(r => setTimeout(r, 400));
      if (cancelled) return;

      const depth = gameMode === 'endgame' ? ENDGAME_BOT_DEPTH : 10;
      const strength = gameMode === 'endgame' ? ENDGAME_BOT_SKILL : skillLevel;
      const bestMoveUCI = await getStockfishBestMove(fenAtRequest, depth, strength);
      if (cancelled || game.fen() !== fenAtRequest || !bestMoveUCI) return;

      const from = bestMoveUCI.slice(0, 2) as Square;
      const to = bestMoveUCI.slice(2, 4) as Square;
      const promotion = bestMoveUCI.length > 4 ? bestMoveUCI[4] as PieceType : undefined;

      onBotMove(from, to, promotion);
    };

    void makeBotMove().finally(() => {
      if (!cancelled) {
        isBotThinkingRef.current = false;
        setIsBotThinking(false);
      }
    });

    return () => {
      cancelled = true;
      isBotThinkingRef.current = false;
      setIsBotThinking(false);
    };
  }, [game, isSetup, gameMode, playerColor, skillLevel, positionKey, onBotMove, sessionKey]);

  return { isBotThinking };
}
