// Evaluation engine utilizing the local Stockfish backend proxy

// Fetch the true professional score from our local Stockfish backend
export async function getStockfishEvaluation(fen: string): Promise<{ score: number, mate: number | null }> {
    try {
        const response = await fetch('http://localhost:3001/eval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen })
        });
        const data = await response.json();
        return { score: data.score, mate: data.mate };
    } catch (error) {
        console.error('Error fetching Stockfish eval:', error);
        return { score: 0, mate: null };
    }
}

export interface Puzzle {
    id: string;
    fen: string;
    moves: string[];
    solution: string[];
    rating: number;
    themes: string[];
    categoryRemaining?: number;
    categoryTotal?: number;
}

export interface EndgamePosition {
    id: string;
    name: string;
    fen: string;
    side: 'w' | 'b';
    description: string;
}

export async function getRandomPuzzle(): Promise<Puzzle | null> {
    try {
        const response = await fetch('http://localhost:3001/puzzle/random');
        return await response.json();
    } catch (error) {
        console.error('Error fetching puzzle:', error);
        return null;
    }
}

export async function getEndgamePosition(): Promise<EndgamePosition | null> {
    try {
        const response = await fetch('http://localhost:3001/puzzle/endgame');
        return await response.json();
    } catch (error) {
        console.error('Error fetching endgame:', error);
        return null;
    }
}

export async function getPolgarPuzzle(type?: string): Promise<Puzzle | null> {
    try {
        const query = type ? `?type=${encodeURIComponent(type)}` : '';
        const response = await fetch(`http://localhost:3001/puzzle/polgar${query}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching Polgar puzzle:', error);
        return null;
    }
}

// Fetch the best move from the engine (UCI format)
export async function getStockfishBestMove(fen: string, depthValue: number = 12, skillLevel: number = 20): Promise<string | null> {
    try {
        const response = await fetch('http://localhost:3001/bestmove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, depth: depthValue, skillLevel })
        });
        const data = await response.json();
        return data.bestmove;
    } catch (error) {
        console.error('Error fetching Stockfish best move:', error);
        return null;
    }
}

export async function reportPuzzleResult(id: string, success: boolean): Promise<void> {
    try {
        await fetch('http://localhost:3001/puzzle/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, success })
        });
    } catch (error) {
        console.error('Error reporting puzzle result:', error);
    }
}

export interface PuzzleStats {
    totalPuzzlesTouched: number;
    totalAttempts: number;
    successRate: string;
    dueReviewCount: number;
    forecast: Record<string, number>;
}

export async function getPuzzleStats(): Promise<PuzzleStats | null> {
    try {
        const response = await fetch('http://localhost:3001/puzzle/stats');
        return await response.json();
    } catch (error) {
        console.error('Error fetching puzzle stats:', error);
        return null;
    }
}
