const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/api';

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('chess_token');
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

export async function getStockfishEvaluation(fen: string): Promise<{ score: number; mate: number | null }> {
  try {
    const response = await fetch(`${API_BASE}/eval`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ fen }),
    });
    const data = await response.json();
    return { score: data.score, mate: data.mate };
  } catch (error) {
    console.error('Error fetching Stockfish eval:', error);
    return { score: 0, mate: null };
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

export interface PuzzleStats {
  totalPuzzlesTouched: number;
  totalAttempts: number;
  successRate: string;
  dueReviewCount: number;
  forecast: Record<string, number>;
}

// ─── Puzzles ──────────────────────────────────────────────────────────────────


export async function getEndgamePosition(): Promise<EndgamePosition | null> {
  try {
    const response = await fetch(`${API_BASE}/puzzle/endgame`, { headers: authHeaders() });
    return await response.json();
  } catch (error) {
    console.error('Error fetching endgame:', error);
    return null;
  }
}

export async function getPolgarPuzzle(type?: string): Promise<Puzzle | null> {
  try {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    const response = await fetch(`${API_BASE}/puzzle/polgar${query}`, { headers: authHeaders() });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch Polgar puzzle');
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching Polgar puzzle:', error);
    return null;
  }
}

// ─── Stockfish ────────────────────────────────────────────────────────────────

export async function getStockfishBestMove(
  fen: string,
  depthValue: number = 12,
  skillLevel: number = 20,
): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/bestmove`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ fen, depth: depthValue, skillLevel }),
    });
    const data = await response.json();
    return data.bestmove;
  } catch (error) {
    console.error('Error fetching Stockfish best move:', error);
    return null;
  }
}

// ─── Progress / Stats ─────────────────────────────────────────────────────────

export async function reportPuzzleResult(id: string, success: boolean): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/progress/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ success }),
    });
  } catch (error) {
    console.error('Error reporting puzzle result:', error);
  }
}

export async function getPuzzleStats(): Promise<PuzzleStats | null> {
  try {
    const response = await fetch(`${API_BASE}/puzzle/stats`, { headers: authHeaders() });
    return await response.json();
  } catch (error) {
    console.error('Error fetching puzzle stats:', error);
    return null;
  }
}
