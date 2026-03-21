import { describe, it } from 'vitest';
import { ChessGame } from './ChessGame';
import { getStockfishEvaluation } from './eval';
import type { Square } from './types';

describe('eval', () => {
    it('evaluates', async () => {
        const game = new ChessGame();
        // Skip calling backend in unit tests to avoid dependency on running server
        // but keep the structure for manual verification
        let score = await getStockfishEvaluation(game.fen());
        console.log('Initial score:', score);
        
        game.makeMove('e2' as Square, 'e4' as Square);
        score = await getStockfishEvaluation(game.fen());
        console.log('After e4:', score);
    });
});
