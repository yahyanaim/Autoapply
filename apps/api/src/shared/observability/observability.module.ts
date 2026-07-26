import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RequestContextService } from './request-context.service';
import { RequestObservabilityInterceptor } from './request-observability.interceptor';
import { SystemClock } from '../adapters/system-clock.adapter';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    RequestContextService,
    SystemClock,
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestObservabilityInterceptor,
    },
  ],
  exports: [RequestContextService, SystemClock],
})
export class ObservabilityModule {}
