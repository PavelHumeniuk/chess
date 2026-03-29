import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPuzzleStats, getStockfishBestMove, getStockfishEvaluation, reportPuzzleResult } from './eval';

describe('eval', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns parsed score when eval call succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ score: 45, mate: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getStockfishEvaluation('test-fen');
    expect(result).toEqual({ score: 45, mate: null });
  });

  it('returns safe fallback when bestmove request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getStockfishBestMove('test-fen');
    expect(result).toBeNull();
  });

  it('does not throw when report endpoint fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: 'forbidden' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(reportPuzzleResult('puzzle-1', true)).resolves.toBeUndefined();
  });

  it('returns null stats when server does not return ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'auth required' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const stats = await getPuzzleStats();
    expect(stats).toBeNull();
  });
});
