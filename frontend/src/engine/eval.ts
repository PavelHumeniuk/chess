const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '/api';

function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

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
    const response = await fetch(apiUrl('/eval'), {
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
  level: string;
  levelLabel: string;
  chapter: string;
  categoryRemaining?: number;
  categoryTotal?: number;
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
export async function getEndgamePosition(level?: string): Promise<EndgamePosition> {
  const query = level ? `?level=${encodeURIComponent(level)}` : '';
  const response = await fetch(apiUrl(`/puzzle/endgame${query}`), { headers: authHeaders(), credentials: 'include' });
  return await parseJsonOrThrow(response) as EndgamePosition;
}

export async function getPolgarPuzzle(type?: string): Promise<Puzzle | null> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  const response = await fetch(apiUrl(`/puzzle/polgar${query}`), { headers: authHeaders(), credentials: 'include' });
  return await parseJsonOrThrow(response) as Puzzle;
}

// ─── Stockfish ────────────────────────────────────────────────────────────────

export async function getStockfishBestMove(
  fen: string,
  depthValue: number = 12,
  skillLevel: number = 20,
): Promise<string | null> {
  try {
    const response = await fetch(apiUrl('/bestmove'), {
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

export interface EngineAnalysis {
  score: number;
  mate: number | null;
  lines: { score: number; mate: number | null; pv: string[] }[];
}

export async function getAnalysis(
  fen: string,
  depth: number = 12,
  multiPv: number = 3,
): Promise<EngineAnalysis | null> {
  try {
    const response = await fetch(apiUrl('/analyze'), {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify({ fen, depth, multiPv }),
    });
    return await parseJsonOrThrow(response) as EngineAnalysis;
  } catch (error) {
    console.error('Error fetching engine analysis:', error);
    return null;
  }
}


// ─── Progress / Stats ─────────────────────────────────────────────────────────

export async function reportPuzzleResult(id: string, success: boolean): Promise<void> {
  try {
    const response = await fetch(apiUrl(`/progress/${encodeURIComponent(id)}`), {
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

export async function getPuzzleStats(kind?: 'polgar' | 'endgame'): Promise<PuzzleStats | null> {
  try {
    const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    const response = await fetch(apiUrl(`/puzzle/stats${query}`), { headers: authHeaders(), credentials: 'include' });
    return await parseJsonOrThrow(response) as PuzzleStats;
  } catch (error) {
    console.error('Error fetching puzzle stats:', error);
    return null;
  }
}

// ─── Game History ─────────────────────────────────────────────────────────────

export interface GameRecord {
  id: number;
  played_at: string;
  bot_rating: number;
  player_color: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  total_moves: number;
  moves?: string[];
}

export async function saveGame(payload: {
  botRating: number;
  playerColor: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  moves: string[];
}): Promise<void> {
  try {
    const response = await fetch(apiUrl('/games'), {
      method: 'POST',
      headers: authHeaders(),
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    await parseJsonOrThrow(response);
  } catch (error) {
    console.error('Error saving game:', error);
  }
}

export async function getGames(): Promise<GameRecord[]> {
  try {
    const response = await fetch(apiUrl('/games'), { headers: authHeaders(), credentials: 'include' });
    return await parseJsonOrThrow(response) as GameRecord[];
  } catch (error) {
    console.error('Error fetching games:', error);
    return [];
  }
}

export async function getGame(id: number): Promise<GameRecord | null> {
  try {
    const response = await fetch(apiUrl(`/games/${id}`), { headers: authHeaders(), credentials: 'include' });
    return await parseJsonOrThrow(response) as GameRecord;
  } catch (error) {
    console.error('Error fetching game:', error);
    return null;
  }
}

export async function deleteGame(id: number): Promise<void> {
  const response = await fetch(apiUrl(`/games/${id}`), {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  await parseJsonOrThrow(response);
}
