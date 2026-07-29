import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { CareerChatService } from '../application/career-chat.service';
import { CareerChatContextService } from '../application/career-chat-context.service';
import { CareerChatProvider } from '../domain/career-chat-provider.interface';

describe('CareerChatService', () => {
  const provider: jest.Mocked<CareerChatProvider> = {
    complete: jest.fn(),
  };
  const contextService = {
    build: jest.fn(),
  } as unknown as jest.Mocked<CareerChatContextService>;
  let service: CareerChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CareerChatService(provider, contextService);
    contextService.build.mockResolvedValue({
      text: 'Official source: https://www.anapec.org/',
      allowedSources: ['https://www.anapec.org/'],
    });
    provider.complete.mockResolvedValue({
      answer:
        'Use the official ANAPEC portal: https://www.anapec.org/ Do not rely on unverified listings.',
      model: 'MiniMaxAI/MiniMax-M2.7',
    });
  });

  it('uses only the independent provider and returns allow-listed sources', async () => {
    const result = await service.answer([
      { role: 'user', content: 'How can I find work in Casablanca?' },
    ]);

    expect(provider.complete).toHaveBeenCalledTimes(1);
    const sentMessages = provider.complete.mock.calls[0]?.[0] ?? [];
    expect(sentMessages[0]?.role).toBe('system');
    expect(sentMessages[0]?.content).toContain('Morocco career guide');
    expect(sentMessages[1]?.content).toContain('Trusted context');
    expect(sentMessages.at(-1)).toEqual({
      role: 'user',
      content: 'How can I find work in Casablanca?',
    });
    expect(result).toEqual({
      answer:
        'Use the official ANAPEC portal: https://www.anapec.org/ Do not rely on unverified listings.',
      model: 'MiniMaxAI/MiniMax-M2.7',
      sources: ['https://www.anapec.org/'],
      privacy: 'not-stored',
    });
  });

  it('does not expose a source invented by the model', async () => {
    provider.complete.mockResolvedValue({
      answer: 'Official: https://www.anapec.org/ Unknown: https://malicious.example/jobs',
      model: 'model-test',
    });

    const result = await service.answer([{ role: 'user', content: 'Show me trusted sources' }]);

    expect(result.sources).toEqual(['https://www.anapec.org/']);
  });

  it('requires the final message to belong to the user', async () => {
    await expect(
      service.answer([{ role: 'assistant', content: 'Previous answer' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized conversations before calling Dahl', async () => {
    await expect(
      service.answer([{ role: 'user', content: 'x'.repeat(8_001) }]),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('sends only the most recent ten conversation messages', async () => {
    const messages = Array.from({ length: 11 }, (_, index) => ({
      role: (index % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `message-${index}`,
    }));

    await service.answer(messages);

    const sentMessages = provider.complete.mock.calls[0]?.[0] ?? [];
    expect(sentMessages).toHaveLength(12);
    expect(sentMessages[2]?.content).toBe('message-1');
    expect(sentMessages.at(-1)?.content).toBe('message-10');
  });
});
