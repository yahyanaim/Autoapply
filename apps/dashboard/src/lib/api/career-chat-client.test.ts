import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  careerChatClient,
  validateCareerChatResponse,
} from './career-chat-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('careerChatClient', () => {
  it.each([
    '<think>PRIVATE</think>Final',
    '<think>PRIVATE',
    '</think>Final',
    '‹think›PRIVATE‹/think›Final',
    '&lt;think&gt;PRIVATE',
    '&#60;think>PRIVATE',
    '<analysis>PRIVATE</analysis>',
    '<thi',
    'x'.repeat(2_001),
    '',
  ])(
    'rejects unsafe or invalid full responses before rendering (%#)',
    async (answer) => {
      const fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            answer,
            model: 'test',
            sources: [],
            privacy: 'not-stored',
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal('fetch', fetch);
      await expect(
        careerChatClient.ask([{ role: 'user', content: 'Hi' }]),
      ).rejects.toThrow('invalid answer');
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('whitelists public response fields and preserves valid code and length boundaries', () => {
    const response = validateCareerChatResponse({
      answer: 'Use `Array<T>` where x < y.',
      model: 'test',
      sources: [],
      privacy: 'not-stored',
      reasoning_content: 'PRIVATE',
    });
    expect(response.answer).toBe('Use `Array<T>` where x < y.');
    expect(JSON.stringify(response)).not.toContain('PRIVATE');
    for (const length of [1_999, 2_000])
      expect(
        validateCareerChatResponse({ ...response, answer: 'ع'.repeat(length) })
          .answer,
      ).toHaveLength(length);
    expect(() =>
      validateCareerChatResponse({ ...response, sources: [null] }),
    ).toThrow('invalid answer');
  });

  it('does not surface reasoning echoed in an HTTP error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: '<think>PRIVATE</think>' }), {
          status: 502,
        }),
      ),
    );
    await expect(
      careerChatClient.ask([{ role: 'user', content: 'Hi' }]),
    ).rejects.toThrow('temporarily unavailable');
  });

  it('does not expose a malformed JSON body through a parse error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response('<think>PRIVATE', { status: 200 })),
    );
    const error = await careerChatClient
      .ask([{ role: 'user', content: 'Hi' }])
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('invalid answer');
    expect((error as Error).message).not.toContain('PRIVATE');
  });
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

    await careerChatClient.ask([
      { role: 'user', content: 'Where can I look?' },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe('/career-chat/messages');
    expect(options.credentials).toBe('omit');
    expect(new Headers(options.headers).has('Authorization')).toBe(false);
    expect(JSON.parse(String(options.body))).toEqual({
      messages: [{ role: 'user', content: 'Where can I look?' }],
    });
  });

  it('surfaces the standalone API error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: 'Career Assistant is unavailable' }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    await expect(
      careerChatClient.ask([{ role: 'user', content: 'Hello' }]),
    ).rejects.toThrow('Career Assistant is unavailable');
  });
});
