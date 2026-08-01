import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CareerChatHealthService } from '../infrastructure/career-chat-health.service';

describe('CareerChatHealthService', () => {
  const originalFetch = global.fetch;
  const values: Record<string, unknown> = {
    CAREER_CHAT_ENABLED: true,
    DAHL_CAREER_CHAT_BASE_URL: 'https://inference.dahl.global/v1',
    DAHL_CAREER_CHAT_HEALTH_TIMEOUT_MS: 3_000,
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in values ? values[key] : fallback,
    ),
  } as unknown as ConfigService;

  afterEach(() => {
    global.fetch = originalFetch;
    values.CAREER_CHAT_ENABLED = true;
    jest.useRealTimers();
  });

  it('does not contact Dahl when the Career Assistant is disabled', async () => {
    values.CAREER_CHAT_ENABLED = false;
    global.fetch = jest.fn() as typeof fetch;

    await expect(
      new CareerChatHealthService(config).check(),
    ).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uses the public models endpoint without a provider key or content', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('ok', { status: 200 }));
    global.fetch = fetchMock as typeof fetch;

    await expect(
      new CareerChatHealthService(config).check(),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://inference.dahl.global/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ApplyAI-Career-Assistant-Health/1.0',
        },
      }),
    );
  });

  it('fails readiness safely when Dahl times out', async () => {
    jest.useFakeTimers();
    values.DAHL_CAREER_CHAT_HEALTH_TIMEOUT_MS = 500;
    global.fetch = jest.fn((_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          { once: true },
        );
      });
    }) as typeof fetch;

    const check = new CareerChatHealthService(config).check();
    const rejection = expect(check).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await jest.advanceTimersByTimeAsync(500);

    await rejection;
  });
});
