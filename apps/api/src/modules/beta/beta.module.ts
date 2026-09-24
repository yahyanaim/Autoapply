import { Module } from '@nestjs/common';
import { BetaRegistrationGateService } from './application/beta-registration-gate.service';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [BetaRegistrationGateService],
  exports: [BetaRegistrationGateService],
})
export class BetaModule {}
