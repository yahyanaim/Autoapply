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
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({
        model: 'MiniMaxAI/MiniMax-M2.7',
        max_tokens: 700,
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
});
