import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Performs a non-content availability probe. It never sends an API key,
 * conversation, prompt, or generated answer.
 */
@Injectable()
export class CareerChatHealthService {
  constructor(private readonly config: ConfigService) {}

  async check(): Promise<void> {
    if (!this.config.get<boolean>('CAREER_CHAT_ENABLED', false)) return;

    const baseUrl = this.config
      .get<string>(
        'DAHL_CAREER_CHAT_BASE_URL',
        'https://inference.dahl.global/v1',
      )
      .replace(/\/$/, '');
    const timeoutMs = this.config.get<number>(
      'DAHL_CAREER_CHAT_HEALTH_TIMEOUT_MS',
      3_000,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Dahl documents GET /v1/models as a public, keyless availability check.
      // Keep this probe free of credentials and user content.
      const response = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ApplyAI-Career-Assistant-Health/1.0',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ServiceUnavailableException(
          'Career Assistant provider is unavailable',
        );
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(
        'Career Assistant provider is unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
