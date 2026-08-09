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
  ResumeParseQueueToken,
  StorageToken,
} from './modules/resume/application/resume.service';
import { Throttle } from '@nestjs/throttler';
import { StoragePort } from './shared/ports/storage.port';

@ApiExcludeController()
@Controller('health')
@Throttle({ default: { limit: 100, ttl: 15 * 60_000 } })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ResumeParseQueueToken) private readonly resumeQueue: Queue,
    @Inject(StorageToken) private readonly storage: StoragePort,
  ) {}

  @Get()
  liveness() {
    return { status: 'ok' };
  }

  @Get('ready')
  async readiness() {
    try {
      const redis = await this.resumeQueue.client;
      await Promise.all([
        this.prisma.$queryRaw`SELECT 1`,
        redis.get('applyai:health:readiness'),
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
}
