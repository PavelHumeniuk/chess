import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

describe('backend API hardening', () => {
  let app;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.STOCKFISH_PATH = 'tail';
    process.env.STOCKFISH_TIMEOUT_MS = '50';

    const appModule = await import('../index.js');
    app = appModule.default || appModule;
  });

  it('rejects missing FEN for /eval', async () => {
    const response = await request(app).post('/eval').send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('FEN is required');
  });

  it('rejects missing FEN for /bestmove', async () => {
    const response = await request(app).post('/bestmove').send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('FEN is required');
  });

  it('requires auth for protected puzzle endpoint', async () => {
    const response = await request(app).get('/puzzle/polgar');
    expect(response.status).toBe(401);
  });

  it('times out engine calls and returns safe error', async () => {
    const response = await request(app)
      .post('/eval')
      .send({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Stockfish error');
  });
});
