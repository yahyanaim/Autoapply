import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DahlCareerChatProvider } from '../infrastructure/dahl-career-chat.provider';

describe('DahlCareerChatProvider', () => {
  const originalFetch = global.fetch;
  const values: Record<string, unknown> = {
    CAREER_CHAT_ENABLED: true,
    DAHL_CAREER_CHAT_API_KEY: 'test-key-not-a-secret',
    DAHL_CAREER_CHAT_BASE_URL: 'https://inference.dahl.global/v1',
    DAHL_CAREER_CHAT_MODEL: 'MiniMaxAI/MiniMax-M2.7',
    DAHL_CAREER_CHAT_TIMEOUT_MS: 30_000,
    DAHL_CAREER_CHAT_MAX_OUTPUT_TOKENS: 700,
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => (key in values ? values[key] : fallback)),
  } as unknown as ConfigService;

  afterEach(() => {
    global.fetch = originalFetch;
    values.CAREER_CHAT_ENABLED = true;
    values.DAHL_CAREER_CHAT_API_KEY = 'test-key-not-a-secret';
    jest.clearAllMocks();
  });

  it('does not run when the isolated chatbot is disabled', async () => {
    values.CAREER_CHAT_ENABLED = false;
    const provider = new DahlCareerChatProvider(config);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('does not fall back to the existing AI provider key', async () => {
    values.DAHL_CAREER_CHAT_API_KEY = '';
    const provider = new DahlCareerChatProvider(config);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }])).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('calls the Dahl OpenAI-compatible endpoint with the dedicated key', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'MiniMaxAI/MiniMax-M2.7',
          choices: [{ message: { content: 'Career answer' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    global.fetch = fetchMock as typeof fetch;
    const provider = new DahlCareerChatProvider(config);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }])).resolves.toEqual({
      answer: 'Career answer',
      model: 'MiniMaxAI/MiniMax-M2.7',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://inference.dahl.global/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key-not-a-secret',
        }),
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      model: 'MiniMaxAI/MiniMax-M2.7',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(request.headers).toEqual(
      expect.objectContaining({
        'User-Agent': 'ApplyAI-Nori/1.0 (+https://autoapply-phi.vercel.app)',
      }),
    );
  });

  it('returns a safe error without provider response details', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('sensitive upstream error', { status: 500 })) as typeof fetch;
    const provider = new DahlCareerChatProvider(config);

    await expect(provider.complete([{ role: 'user', content: 'Hello' }])).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('retries a rejected system role with a guarded Dahl-compatible conversation', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('system role rejected', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'MiniMaxAI/MiniMax-M2.7',
            choices: [{ message: { content: 'Compatible answer' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    global.fetch = fetchMock as typeof fetch;
    const provider = new DahlCareerChatProvider(config);

    await expect(
      provider.complete([
        { role: 'system', content: 'Stay within Morocco career guidance.' },
        { role: 'user', content: 'Help me prepare.' },
      ]),
    ).resolves.toEqual({
      answer: 'Compatible answer',
      model: 'MiniMaxAI/MiniMax-M2.7',
    });

    const retry = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const retryBody = JSON.parse(String(retry.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(retryBody.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(retryBody.messages[0]?.content).toContain('Stay within Morocco career guidance.');
  });

  it('probes key authentication without logging provider response content after a 403', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response('blocked upstream response', { status: 403 }))
      .mockResolvedValueOnce(new Response('blocked compatible response', { status: 403 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ available_tokens: 99_999_999 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    global.fetch = fetchMock as typeof fetch;
    const provider = new DahlCareerChatProvider(config);

    await expect(
      provider.complete([
        { role: 'system', content: 'Career instructions' },
        { role: 'user', content: 'Hello' },
      ]),
    ).rejects.toBeInstanceOf(BadGatewayException);

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://inference.dahl.global/tokens/current',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key-not-a-secret',
        }),
      }),
    );
  });
});
