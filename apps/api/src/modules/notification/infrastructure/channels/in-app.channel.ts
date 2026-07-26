import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import { NotificationStatus } from '@prisma/client';
import { SystemClock } from '../../../../shared/adapters/system-clock.adapter';

@Injectable()
export class InAppChannel {
  private readonly logger = new Logger(InAppChannel.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly clock: SystemClock = new SystemClock(),
  ) {}

  async send(notification: { id: string }): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { status: NotificationStatus.sent, sentAt: this.clock.now() },
    });
    this.logger.log(`In-app notification ${notification.id} delivered`);
  }
}
