import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthManager } from '../../src/background/auth/auth-manager';

describe('AuthManager', () => {
  const sessionValues: Record<string, unknown> = {};
  const localValues: Record<string, unknown> = {};
  const fetchMock = vi.fn();

  function storageArea(values: Record<string, unknown>) {
    return {
      get: vi.fn(async (key: string | string[]) => {
        const keys = Array.isArray(key) ? key : [key];
        return Object.fromEntries(keys.map((item) => [item, values[item]]));
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(values, items);
      }),
      remove: vi.fn(async (key: string | string[]) => {
        for (const item of Array.isArray(key) ? key : [key]) delete values[item];
      }),
      setAccessLevel: vi.fn(async () => undefined),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(sessionValues)) delete sessionValues[key];
    for (const key of Object.keys(localValues)) delete localValues[key];
    vi.stubGlobal('chrome', {
      storage: {
        session: storageArea(sessionValues),
        local: storageArea(localValues),
      },
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('keeps access and refresh credentials in separate storage areas', async () => {
    const manager = new AuthManager();

    await manager.setTokens({ accessToken: 'access-token', refreshToken: 'refresh-token' });

    expect(sessionValues).toEqual({ authToken: 'access-token' });
    expect(localValues).toEqual({ refreshToken: 'refresh-token' });
    expect(await manager.getToken()).toBe('access-token');
    expect(await manager.getRefreshToken()).toBe('refresh-token');
  });

  it('exchanges a one-time dashboard handoff without sending credentials', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await new AuthManager().exchangeHandoff('one-time-code');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/auth/extension/exchange',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: 'one-time-code' }),
      }),
    );
    expect(sessionValues.authToken).toBe('access-token');
    expect(localValues.refreshToken).toBe('refresh-token');
  });

  it('rotates tokens and retries one unauthorized API request', async () => {
    sessionValues.authToken = 'expired-access';
    localValues.refreshToken = 'old-refresh';
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    const response = await new AuthManager().apiFetch('/resumes');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3001/auth/refresh',
      expect.objectContaining({ body: JSON.stringify({ refreshToken: 'old-refresh' }) }),
    );
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:3001/resumes');
    const retriedHeaders = new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers);
    expect(retriedHeaders.get('Authorization')).toBe('Bearer new-access');
    expect(sessionValues.authToken).toBe('new-access');
    expect(localValues.refreshToken).toBe('new-refresh');
  });

  it('coalesces concurrent refreshes so a rotated token is used only once', async () => {
    localValues.refreshToken = 'old-refresh';
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const manager = new AuthManager();

    await expect(
      Promise.all([manager.refreshToken(), manager.refreshToken()]),
    ).resolves.toEqual(['new-access', 'new-access']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localValues.refreshToken).toBe('new-refresh');
  });

  it('always clears local credentials even if the logout request fails', async () => {
    sessionValues.authToken = 'access-token';
    localValues.refreshToken = 'refresh-token';
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    await expect(new AuthManager().logout()).rejects.toThrow('offline');

    expect(sessionValues).toEqual({});
    expect(localValues).toEqual({});
  });
});
