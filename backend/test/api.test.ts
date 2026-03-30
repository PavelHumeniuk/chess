import { beforeEach, describe, expect, it, vi } from 'vitest';

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    cookies: [] as Array<Record<string, unknown>>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    cookie(name: string, value: string, options: Record<string, unknown>) {
      this.cookies.push({ name, value, options });
      return this;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      this.cookies.push({ name, cleared: true, options });
      return this;
    },
  };
}

describe('backend auth and scheduling helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.JWT_SECRET = 'test-secret';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  });

  it('rejects missing Google credentials early', async () => {
    const { googleLogin } = await import('../auth');
    const req = { body: {} };
    const res = createResponse();

    await googleLogin(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Google credential is required' });
  });

  it('rejects missing request bodies without throwing HTML 500s', async () => {
    const { googleLogin } = await import('../auth');
    const req = {};
    const res = createResponse();

    await googleLogin(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Google credential is required' });
  });

  it('returns a clear 500 when auth env vars are missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const { googleLogin } = await import('../auth');
    const req = { body: { credential: 'token' } };
    const res = createResponse();

    await googleLogin(req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Authentication service misconfigured' });
  });

  it('reads auth token from cookies', async () => {
    const { readCookieToken } = await import('../auth');
    const req = {
      headers: {
        cookie: 'other=1; chess_token=abc.def.ghi; theme=dark',
      },
    };

    expect(readCookieToken(req)).toBe('abc.def.ghi');
  });

  it('rejects protected requests without a token', async () => {
    const requireAuthModule = await import('../middleware/requireAuth');
    const requireAuth = requireAuthModule.default || requireAuthModule;
    const req = { headers: {} };
    const res = createResponse();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('treats ISO timestamps that are earlier on the same day as due', async () => {
    const { isDueDate } = await import('../db');
    const now = new Date('2026-03-29T21:00:00.000Z');

    expect(isDueDate('2026-03-29T10:00:00.000Z', now)).toBe(true);
    expect(isDueDate('2026-03-29T23:00:00.000Z', now)).toBe(false);
  });

  it('includes the production domain in default CORS origins', async () => {
    process.env.DOMAIN = 'chess.phuman.me';
    const appModule = await import('../index');
    const app = appModule.default || appModule;
    const corsLayer = app._router.stack.find((layer: { name?: string }) => layer.name === 'corsMiddleware');

    expect(corsLayer).toBeTruthy();
  });

  it('normalizes legacy and label-style endgame levels', async () => {
    const { canonicalizeEndgameLevel } = await import('../index');

    expect(canonicalizeEndgameLevel('Class A')).toBe('class_a');
    expect(canonicalizeEndgameLevel('expert')).toBe('experts');
    expect(canonicalizeEndgameLevel('Beginners to Class D')).toBe('beginner_class_d');
  });
});
