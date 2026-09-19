import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { PrismaService } from './database/prisma/prisma.service';
import {
  ResumeParseFreeQueueToken,
  ResumeParsePaidQueueToken,
  StorageToken,
} from './modules/resume/application/resume.service';
import { Throttle } from '@nestjs/throttler';
import { StoragePort } from './shared/ports/storage.port';
import { ConfigService } from '@nestjs/config';

@ApiExcludeController()
@Controller('health')
@Throttle({ default: { limit: 100, ttl: 15 * 60_000 } })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ResumeParseFreeQueueToken) private readonly freeResumeQueue: Queue,
    @Inject(ResumeParsePaidQueueToken) private readonly paidResumeQueue: Queue,
    @Inject(StorageToken) private readonly storage: StoragePort,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    try {
      const redisClients = await Promise.all(
        this.enabledQueues().map((queue) => queue.client),
      );
      await Promise.all([
        this.prisma.$queryRaw`SELECT 1`,
        ...redisClients.map((redis) =>
          redis.get('applyai:health:readiness'),
        ),
        this.storage.checkHealth(),
      ]);
      return {
        status: 'ready',
        dependencies: {
          database: 'ready',
          redis: 'ready',
          storage: 'ready',
        },
      };
    } catch {
      throw new ServiceUnavailableException(
        'A required dependency is unavailable',
      );
    }
  }

  private enabledQueues(): Queue[] {
    const executionRole = this.configService.get<string>(
      'AI_EXECUTION_ROLE',
      'all',
    );
    if (executionRole === 'free') return [this.freeResumeQueue];
    if (executionRole === 'paid') return [this.paidResumeQueue];
    return [this.freeResumeQueue, this.paidResumeQueue];
  }
}
