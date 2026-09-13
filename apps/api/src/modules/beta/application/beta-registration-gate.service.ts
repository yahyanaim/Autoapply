import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

const BETA_GATE_ID = 'singleton';

@Injectable()
export class BetaRegistrationGateService {
  constructor(private readonly config: ConfigService) {}

  async claimSlot(transaction: Prisma.TransactionClient): Promise<void> {
    if (!this.isEnabled()) return;

    const maximum = this.config.get<number>('BETA_MAX_REGISTRATIONS', 100);
    const claimed = await transaction.betaRegistrationGate.updateMany({
      where: {
        id: BETA_GATE_ID,
        count: { lt: maximum },
      },
      data: { count: { increment: 1 } },
    });

    if (claimed.count !== 1) {
      throw new ForbiddenException('The ApplyAI beta is currently full');
    }
  }

  private isEnabled(): boolean {
    return this.config.get<boolean>('BETA_MODE', false) === true;
  }
}
