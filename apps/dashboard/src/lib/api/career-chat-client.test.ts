import { afterEach, describe, expect, it, vi } from 'vitest';
import { careerChatClient } from './career-chat-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('careerChatClient', () => {
  it('uses the standalone public client without credentials or auth headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          answer: 'Check ANAPEC and company career pages.',
          model: 'test-model',
          sources: [],
          privacy: 'not-stored',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await careerChatClient.ask([{ role: 'user', content: 'Where can I look?' }]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/career-chat/messages');
    expect(options.credentials).toBe('omit');
    expect(new Headers(options.headers).has('Authorization')).toBe(false);
  });

  it('surfaces the standalone API error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ message: 'Career Assistant is unavailable' }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
    );

    await expect(careerChatClient.ask([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
      'Career Assistant is unavailable',
    );
  });
});
