import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CareerChatCompletion,
  CareerChatMessage,
  CareerChatProvider,
} from '../domain/career-chat-provider.interface';

interface DahlChatResponse {
  model?: unknown;
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
}

@Injectable()
export class DahlCareerChatProvider implements CareerChatProvider {
  private readonly logger = new Logger(DahlCareerChatProvider.name);

  constructor(private readonly config: ConfigService) {}

  async complete(messages: CareerChatMessage[]): Promise<CareerChatCompletion> {
    if (!this.config.get<boolean>('CAREER_CHAT_ENABLED', false)) {
      throw new ServiceUnavailableException('The Morocco career assistant is not enabled');
    }

    const apiKey = this.config.get<string>('DAHL_CAREER_CHAT_API_KEY', '').trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('The Morocco career assistant is not configured');
    }

    const baseUrl = this.config
      .get<string>('DAHL_CAREER_CHAT_BASE_URL', 'https://inference.dahl.global/v1')
      .replace(/\/$/, '');
    const model = this.config.get<string>('DAHL_CAREER_CHAT_MODEL', 'MiniMaxAI/MiniMax-M2.7');
    const timeoutMs = this.config.get<number>('DAHL_CAREER_CHAT_TIMEOUT_MS', 30_000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'ApplyAI-Nori/1.0 (+https://autoapply-phi.vercel.app)',
        },
        body: JSON.stringify({
          model,
          messages,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const requestId =
          response.headers.get('x-request-id') ??
          response.headers.get('x-correlation-id') ??
          response.headers.get('traceparent');
        this.logger.error(
          `Dahl request rejected with HTTP ${response.status}${requestId ? ` (request ${requestId})` : ''}`,
        );
        if (response.status === 403) {
          await this.logAuthenticationProbe(baseUrl, apiKey, controller.signal);
        }
        throw new BadGatewayException('The Morocco career assistant is temporarily unavailable');
      }

      const payload = (await response.json()) as DahlChatResponse;
      const answer = payload.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) {
        throw new BadGatewayException('The Morocco career assistant returned an invalid response');
      }

      return {
        answer: answer.trim(),
        model: typeof payload.model === 'string' && payload.model ? payload.model : model,
      };
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new GatewayTimeoutException('The Morocco career assistant took too long to answer');
      }
      this.logger.error(
        `Dahl request failed before a response (${error instanceof Error ? error.name : 'unknown error'})`,
      );
      throw new BadGatewayException('The Morocco career assistant is temporarily unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async logAuthenticationProbe(
    baseUrl: string,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<void> {
    const serviceRoot = baseUrl.endsWith('/v1') ? baseUrl.slice(0, -3) : new URL(baseUrl).origin;

    try {
      const response = await fetch(`${serviceRoot}/tokens/current`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'User-Agent': 'ApplyAI-Nori/1.0 (+https://autoapply-phi.vercel.app)',
        },
        signal,
      });
      this.logger.error(`Dahl authentication probe returned HTTP ${response.status}`);
    } catch (error) {
      this.logger.error(
        `Dahl authentication probe failed (${error instanceof Error ? error.name : 'unknown error'})`,
      );
    }
  }
}
