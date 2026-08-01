import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CareerChatHealthService } from '../modules/career-chat/infrastructure/career-chat-health.service';

@Controller('health')
@Throttle({ default: { limit: 100, ttl: 15 * 60_000 } })
export class StandaloneHealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly careerChatHealth: CareerChatHealthService,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok', mode: 'career-chat-standalone' };
  }

  @Get('ready')
  async readiness() {
    if (
      !this.config.get<boolean>('CAREER_CHAT_ENABLED', false) ||
      !this.config.get<string>('DAHL_CAREER_CHAT_API_KEY', '')
    ) {
      throw new ServiceUnavailableException(
        'The Morocco career assistant is not configured',
      );
    }

    await this.careerChatHealth.check();
    return { status: 'ready', mode: 'career-chat-standalone' };
  }
}
