import { Module } from '@nestjs/common';
import { UserService } from './application/user.service';
import { UserController } from './interface/user.controller';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { ResumeModule } from '../resume/resume.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, ResumeModule, BillingModule],
  providers: [UserService],
  controllers: [UserController],
  exports: [UserService],
})
export class UserModule {}
