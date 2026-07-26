import { Module } from '@nestjs/common';
import { AdminService } from './application/admin.service';
import { AdminController } from './interface/admin.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { JobModule } from '../job/job.module';

@Module({
  imports: [PrismaModule, JobModule],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
