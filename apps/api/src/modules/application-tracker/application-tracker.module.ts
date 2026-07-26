import { Module } from '@nestjs/common';
import { ApplicationTrackerService } from './application/application-tracker.service';
import { ApplicationTrackerController } from './interface/application-tracker.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [ApplicationTrackerService],
  controllers: [ApplicationTrackerController],
  exports: [ApplicationTrackerService],
})
export class ApplicationModule {}
