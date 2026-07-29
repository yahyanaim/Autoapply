import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';

@Controller('health')
@Throttle({ default: { limit: 100, ttl: 15 * 60_000 } })
export class StandaloneHealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  liveness() {
    return { status: 'ok', mode: 'career-chat-standalone' };
  }

  @Get('ready')
  readiness() {
    if (
      !this.config.get<boolean>('CAREER_CHAT_ENABLED', false) ||
      !this.config.get<string>('DAHL_CAREER_CHAT_API_KEY', '')
    ) {
      throw new ServiceUnavailableException('The Morocco career assistant is not configured');
    }

    return { status: 'ready', mode: 'career-chat-standalone' };
  }
}
