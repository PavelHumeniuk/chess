const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/api';

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json' };
}

async function parseJsonOrThrow(response: Response) {
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'error' in data
      ? String((data as { error?: string }).error || 'Request failed')
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return data;
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

export async function getStockfishEvaluation(fen: string): Promise<{ score: number; mate: number | null }> {
  try {
    const response = await fetch(`${API_BASE}/eval`, {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ fen }),
    });
    const data = await parseJsonOrThrow(response) as { score?: number; mate?: number | null };
    return { score: data.score ?? 0, mate: data.mate ?? null };
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
    const response = await fetch(`${API_BASE}/puzzle/endgame`, { headers: authHeaders(), credentials: 'include' });
    return await parseJsonOrThrow(response) as EndgamePosition;
  } catch (error) {
    console.error('Error fetching endgame:', error);
    return null;
  }
}

export async function getPolgarPuzzle(type?: string): Promise<Puzzle | null> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  const response = await fetch(`${API_BASE}/puzzle/polgar${query}`, { headers: authHeaders(), credentials: 'include' });
  return await parseJsonOrThrow(response) as Puzzle;
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
      credentials: 'include',
      body: JSON.stringify({ fen, depth: depthValue, skillLevel }),
    });
    const data = await parseJsonOrThrow(response) as { bestmove?: string };
    return data.bestmove ?? null;
  } catch (error) {
    console.error('Error fetching Stockfish best move:', error);
    return null;
  }
}

// ─── Progress / Stats ─────────────────────────────────────────────────────────

export async function reportPuzzleResult(id: string, success: boolean): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/api/progress/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ success }),
    });
    await parseJsonOrThrow(response);
  } catch (error) {
    console.error('Error reporting puzzle result:', error);
  }
}

export async function getPuzzleStats(): Promise<PuzzleStats | null> {
  try {
    const response = await fetch(`${API_BASE}/puzzle/stats`, { headers: authHeaders(), credentials: 'include' });
    return await parseJsonOrThrow(response) as PuzzleStats;
  } catch (error) {
    console.error('Error fetching puzzle stats:', error);
    return null;
  }
}
