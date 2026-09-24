import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';

const BETA_GATE_ID = 'singleton';

@Injectable()
export class BetaRegistrationGateService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getAdminSummary() {
    const gate = await this.prisma.betaRegistrationGate.findUnique({
      where: { id: BETA_GATE_ID },
      select: { count: true, updatedAt: true },
    });
    if (!gate) throw new NotFoundException('Beta registration gate not found');
    const capacity = Math.max(
      0,
      this.config.get<number>('BETA_MAX_REGISTRATIONS', 100),
    );
    const enabled = this.isEnabled();
    const remainingSlots = Math.max(0, capacity - gate.count);
    return {
      enabled,
      registrationCount: gate.count,
      capacity,
      remainingSlots,
      status: !enabled ? ('disabled' as const) : remainingSlots > 0 ? ('open' as const) : ('full' as const),
      updatedAt: gate.updatedAt.toISOString(),
    };
  }

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
