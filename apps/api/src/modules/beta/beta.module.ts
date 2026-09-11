import { Module } from '@nestjs/common';
import { BetaRegistrationGateService } from './application/beta-registration-gate.service';

@Module({
  providers: [BetaRegistrationGateService],
  exports: [BetaRegistrationGateService],
})
export class BetaModule {}
