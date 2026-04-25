import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { api } from '../index';
import { db, findOrCreateUser, insertGame } from '../db';

const jwt = require('jsonwebtoken') as {
  sign(payload: { id: number; email: string; name: string | null; avatar: string | null }, secret: string, options: { expiresIn: string }): string;
};

interface TestResponse {
  statusCode: number;
  body: unknown;
  headersSent?: boolean;
  status(code: number): TestResponse;
  json(payload: unknown): TestResponse;
  cookie(name: string, value: string, options: Record<string, unknown>): TestResponse;
  clearCookie(name: string, options: Record<string, unknown>): TestResponse;
}

const createdUserIds: number[] = [];

function createResponse(): TestResponse {
  return {
    statusCode: 200,
    body: undefined,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      this.headersSent = true;
      return this;
    },
    cookie() {
      return this;
    },
    clearCookie() {
      return this;
    },
  };
}

function createTestUser() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const user = findOrCreateUser(
    `games-api-${suffix}`,
    `games-api-${suffix}@example.com`,
    'Games API Test',
    null,
  );
  createdUserIds.push(user.id);
  return user;
}

function createSavedGame(userId: number): number {
  const info = insertGame.run({
    userId,
    botRating: 1600,
    playerColor: 'w',
    result: 'win',
    movesJson: JSON.stringify(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']),
    moveTimesJson: JSON.stringify([1200, 1800, 1500, 1400, 2100]),
    moveNotesJson: JSON.stringify(['', '', '', '', '']),
    totalMoves: 5,
  });

  return Number(info.lastInsertRowid);
}

function authHeadersForUser(user: { id: number; email: string; name: string | null; avatar: string | null }) {
  return {
    authorization: `Bearer ${jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET ?? 'test-secret',
      { expiresIn: '30d' },
    )}`,
  };
}

function getRouteHandlers(path: string, method: 'get' | 'patch') {
  const layer = (api.stack as Array<{ route?: { path?: string; methods?: Record<string, boolean>; stack?: Array<{ handle: Function }> } }>)
    .find((entry) => entry.route?.path === path && entry.route.methods?.[method]);

  if (!layer?.route?.stack) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }

  return layer.route.stack.map((entry) => entry.handle);
}

async function runRoute(
  path: string,
  method: 'get' | 'patch',
  req: Record<string, unknown>,
): Promise<TestResponse> {
  const handlers = getRouteHandlers(path, method);
  const res = createResponse();

  const dispatch = async (index: number, error?: unknown): Promise<void> => {
    if (error) throw error;
    const handler = handlers[index];
    if (!handler) return;

    await new Promise<void>((resolve, reject) => {
      let nextCalled = false;
      const next = (nextError?: unknown) => {
        nextCalled = true;
        void dispatch(index + 1, nextError).then(resolve, reject);
      };

      try {
        Promise.resolve(handler(req, res, next))
          .then(() => {
            if (!nextCalled) {
              resolve();
            }
          })
          .catch(reject);
      } catch (caughtError) {
        reject(caughtError);
      }
    });
  };

  await dispatch(0);
  return res;
}

describe('games api note storage', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  });

  afterEach(() => {
    const deleteGames = db.prepare('DELETE FROM games WHERE user_id = ?');
    const deleteProgress = db.prepare('DELETE FROM puzzle_progress WHERE user_id = ?');
    const deleteUsers = db.prepare('DELETE FROM users WHERE id = ?');

    for (const userId of createdUserIds.splice(0)) {
      deleteGames.run(userId);
      deleteProgress.run(userId);
      deleteUsers.run(userId);
    }
  });

  it('normalizes legacy move notes on read and persists updates', async () => {
    const user = createTestUser();
    const gameId = createSavedGame(user.id);

    db.prepare('UPDATE games SET move_notes_json = ? WHERE id = ? AND user_id = ?')
      .run(JSON.stringify(['Remember this idea']), gameId, user.id);

    const legacyRead = await runRoute('/games/:id', 'get', {
      headers: authHeadersForUser(user),
      params: { id: String(gameId) },
    });

    expect(legacyRead.statusCode).toBe(200);
    expect(legacyRead.body).toMatchObject({
      id: gameId,
      move_notes: ['Remember this idea', '', '', '', ''],
    });

    const nextNotes = [
      'Grab space',
      '',
      'Finish development',
      '',
      'Review this plan',
    ];

    const updateResponse = await runRoute('/games/:id/notes', 'patch', {
      headers: authHeadersForUser(user),
      params: { id: String(gameId) },
      body: { moveNotes: nextNotes },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body).toEqual({ ok: true, move_notes: nextNotes });

    const updatedRead = await runRoute('/games/:id', 'get', {
      headers: authHeadersForUser(user),
      params: { id: String(gameId) },
    });

    expect(updatedRead.statusCode).toBe(200);
    expect(updatedRead.body).toMatchObject({
      id: gameId,
      move_notes: nextNotes,
    });
  });

  it('rejects invalid note payloads', async () => {
    const user = createTestUser();
    const gameId = createSavedGame(user.id);

    const wrongLength = await runRoute('/games/:id/notes', 'patch', {
      headers: authHeadersForUser(user),
      params: { id: String(gameId) },
      body: { moveNotes: ['too short'] },
    });

    expect(wrongLength.statusCode).toBe(400);
    expect(wrongLength.body).toEqual({ error: 'moveNotes must be a string array matching the saved move count' });

    const nonString = await runRoute('/games/:id/notes', 'patch', {
      headers: authHeadersForUser(user),
      params: { id: String(gameId) },
      body: { moveNotes: ['ok', '', 7, '', ''] },
    });

    expect(nonString.statusCode).toBe(400);
    expect(nonString.body).toEqual({ error: 'moveNotes must contain only strings' });

    const tooLong = await runRoute('/games/:id/notes', 'patch', {
      headers: authHeadersForUser(user),
      params: { id: String(gameId) },
      body: { moveNotes: ['a'.repeat(1001), '', '', '', ''] },
    });

    expect(tooLong.statusCode).toBe(400);
    expect(tooLong.body).toEqual({ error: 'moveNotes entries must be at most 1000 characters' });
  });
});
