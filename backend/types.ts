export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  avatar: string | null;
  iat?: number;
  exp?: number;
}

export interface RequestLike<
  Body = unknown,
  Query extends Record<string, unknown> = Record<string, unknown>,
  Params extends Record<string, string> = Record<string, string>,
> {
  body?: Body;
  query?: Query;
  params?: Params;
  headers?: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: {
    remoteAddress?: string;
  };
  user?: AuthUser;
}

export interface ResponseLike {
  headersSent?: boolean;
  status(code: number): ResponseLike;
  json(payload: unknown): ResponseLike;
  cookie(name: string, value: string, options: Record<string, unknown>): ResponseLike;
  clearCookie(name: string, options: Record<string, unknown>): ResponseLike;
}

export type NextFunction = (error?: unknown) => void;

export interface UserRow {
  id: number;
  google_id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  created_at: string;
}

export interface PuzzleProgressRow {
  id: number;
  user_id: number;
  puzzle_id: string;
  interval: number;
  ease: number;
  attempts: number;
  successes: number;
  next_due: string;
  last_seen: string | null;
}

export interface PuzzleProgressUpsert {
  userId: number;
  puzzleId: string;
  interval: number;
  ease: number;
  attempts: number;
  successes: number;
  nextDue: string;
  lastSeen: string;
}

export interface PolgarProblem {
  problemid: string;
  fen: string;
  moves: string;
  type: string;
}

export interface PolgarData {
  problems: PolgarProblem[];
}

export interface EndgameRecord {
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

export interface GameRow {
  id: number;
  user_id: number;
  played_at: string;
  bot_rating: number;
  player_color: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  moves_json: string;
  move_times_json: string | null;
  move_notes_json: string | null;
  total_moves: number;
}

export interface GameInsert {
  userId: number;
  botRating: number;
  playerColor: 'w' | 'b';
  result: 'win' | 'loss' | 'draw';
  movesJson: string;
  moveTimesJson: string;
  moveNotesJson: string;
  totalMoves: number;
}
